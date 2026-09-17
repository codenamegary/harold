import { accessSync, constants, statSync } from "node:fs"
import { and, asc, count, desc, eq, gt, lt, or, sql } from "drizzle-orm"
import { Workspace } from "contracts/http/workspace"
import { AgentDatabase } from "../persistence/database"
import { isMissingFilesystemError, isPermissionFilesystemError } from "../filesystem/filesystem.errors"
import { workspaces } from "../persistence/schema/workspaces"
import { createWorkspaceId } from "./workspace.create.workspace.id"
import {
  DeleteWorkspaceRow,
  FindWorkspaceById,
  InsertWorkspace,
  ListAllWorkspaces,
  ListWorkspaces,
  UpdateWorkspaceName,
} from "./workspace.ports"
import {
  decodeWorkspacePageCursor,
  encodeWorkspacePageCursor,
  WorkspacePageCursorPayload,
} from "./workspace.page.cursor"

type WorkspaceRow = typeof workspaces.$inferSelect

const DEFAULT_LIST_LIMIT = 100

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("UNIQUE constraint failed")

const probeWorkspaceState = (canonicalPath: string): Workspace["state"] => {
  try {
    const stats = statSync(canonicalPath)
    if (!stats.isDirectory()) {
      return "missing"
    }

    accessSync(canonicalPath, constants.R_OK | constants.X_OK)
    return "available"
  } catch (error: unknown) {
    if (isMissingFilesystemError(error)) {
      return "missing"
    }
    if (isPermissionFilesystemError(error)) {
      return "unavailable"
    }
    throw error
  }
}

const rowToWorkspace = (row: WorkspaceRow): Workspace => ({
  id: row.id,
  name: row.name,
  path: row.canonicalPath,
  state: probeWorkspaceState(row.canonicalPath),
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
})

const nowIso = (): string => new Date().toISOString()

const getRowById = (database: AgentDatabase, id: string): WorkspaceRow | undefined =>
  database.db.select().from(workspaces).where(eq(workspaces.id, id)).get()

const compareWorkspaces = (left: Workspace, right: Workspace): number => {
  const lastUsedCompare = right.lastUsedAt.localeCompare(left.lastUsedAt)
  return lastUsedCompare === 0 ? left.id.localeCompare(right.id) : lastUsedCompare
}

const paginateFilteredWorkspaces = (
  workspaces: Workspace[],
  limit: number,
  decodedCursor?: WorkspacePageCursorPayload,
):
  | { ok: true; value: { items: Workspace[]; nextCursor?: string; previousCursor?: string } }
  | { ok: false } => {
  if (decodedCursor === undefined) {
    const pageItems = workspaces.slice(0, limit)
    const last = pageItems[pageItems.length - 1]

    return {
      ok: true,
      value: {
        items: pageItems,
        nextCursor:
          pageItems.length === limit && workspaces.length > limit && last !== undefined
            ? encodeWorkspacePageCursor({ id: last.id, edge: "after" })
            : undefined,
        previousCursor: undefined,
      },
    }
  }

  const index = workspaces.findIndex((workspace) => workspace.id === decodedCursor.id)
  if (index === -1) {
    return { ok: false }
  }

  if (decodedCursor.edge === "after") {
    const pageItems = workspaces.slice(index + 1, index + 1 + limit)
    const last = pageItems[pageItems.length - 1]
    const first = pageItems[0]

    return {
      ok: true,
      value: {
        items: pageItems,
        nextCursor:
          index + 1 + pageItems.length < workspaces.length && last !== undefined
            ? encodeWorkspacePageCursor({ id: last.id, edge: "after" })
            : undefined,
        previousCursor:
          first !== undefined && index + 1 > 0
            ? encodeWorkspacePageCursor({ id: first.id, edge: "before" })
            : undefined,
      },
    }
  }

  const start = Math.max(0, index - limit)
  const pageItems = workspaces.slice(start, index)
  const last = pageItems[pageItems.length - 1]
  const first = pageItems[0]

  return {
    ok: true,
    value: {
      items: pageItems,
      nextCursor:
        index < workspaces.length && last !== undefined
          ? encodeWorkspacePageCursor({ id: last.id, edge: "after" })
          : undefined,
      previousCursor:
        start > 0 && first !== undefined
          ? encodeWorkspacePageCursor({ id: first.id, edge: "before" })
          : undefined,
    },
  }
}

const conditionAfter = (row: WorkspaceRow) =>
  or(
    lt(workspaces.lastUsedAt, row.lastUsedAt),
    and(eq(workspaces.lastUsedAt, row.lastUsedAt), gt(workspaces.id, row.id)),
  )

const conditionBefore = (row: WorkspaceRow) =>
  or(
    gt(workspaces.lastUsedAt, row.lastUsedAt),
    and(eq(workspaces.lastUsedAt, row.lastUsedAt), lt(workspaces.id, row.id)),
  )

export const makeInsertWorkspace =
  (database: AgentDatabase): InsertWorkspace =>
    ({ name, canonicalPath }) => {
      const timestamp = nowIso()
      const [createdAt, lastUsedAt] = [timestamp, timestamp]
      const id = createWorkspaceId()
      const workspace = { id, name, canonicalPath, createdAt, lastUsedAt }

      try {
        database.db
          .insert(workspaces)
          .values(workspace)
          .run()
      } catch (error: unknown) {
        if (isUniqueConstraintError(error)) {
          return { ok: false, error: { kind: "duplicate_path" } }
        }
        throw error
      }

      return {
        ok: true,
        value: rowToWorkspace(workspace),
      }
    }

export const makeFindWorkspaceById =
  (database: AgentDatabase): FindWorkspaceById =>
    ({ id }) => {
      const row = getRowById(database, id)
      if (row === undefined) {
        return { ok: false, error: { kind: "not_found" } }
      }

      return { ok: true, value: rowToWorkspace(row) }
    }

export const makeDeleteWorkspaceRow =
  (database: AgentDatabase): DeleteWorkspaceRow =>
    ({ id }) => {
      const row = database.db.delete(workspaces).where(eq(workspaces.id, id)).returning().get()
      if (row === undefined) {
        return { ok: false, error: { kind: "not_found" } }
      }

      return { ok: true, value: undefined }
    }

export const makeUpdateWorkspaceName =
  (database: AgentDatabase): UpdateWorkspaceName =>
    ({ id, name }) => {
      const lastUsedAt = nowIso()
      const row = database.db
        .update(workspaces)
        .set({ name, lastUsedAt })
        .where(eq(workspaces.id, id))
        .returning()
        .get()

      if (row === undefined) {
        return { ok: false, error: { kind: "not_found" } }
      }

      return { ok: true, value: rowToWorkspace(row) }
    }

export const makeListAllWorkspaces =
  (database: AgentDatabase): ListAllWorkspaces =>
    () =>
      database.db
        .select()
        .from(workspaces)
        .orderBy(desc(workspaces.lastUsedAt), asc(workspaces.id))
        .all()
        .map(rowToWorkspace)

export const makeListWorkspaces =
  (database: AgentDatabase): ListWorkspaces => {
    const countAll = (): number =>
      database.db.select({ value: count() }).from(workspaces).get()?.value ?? 0

    const hasMoreAfter = (row: WorkspaceRow): boolean =>
      database.db
        .select()
        .from(workspaces)
        .where(conditionAfter(row))
        .orderBy(desc(workspaces.lastUsedAt), asc(workspaces.id))
        .limit(1)
        .get() !== undefined

    const hasMoreBefore = (row: WorkspaceRow): boolean =>
      database.db
        .select()
        .from(workspaces)
        .where(conditionBefore(row))
        .orderBy(asc(workspaces.lastUsedAt), desc(workspaces.id))
        .limit(1)
        .get() !== undefined

    const buildPageCursors = (rows: WorkspaceRow[]) => {
      if (rows.length === 0) {
        return { nextCursor: undefined, previousCursor: undefined }
      }

      const first = rows[0]
      const last = rows[rows.length - 1]

      return {
        nextCursor: hasMoreAfter(last)
          ? encodeWorkspacePageCursor({ id: last.id, edge: "after" })
          : undefined,
        previousCursor: hasMoreBefore(first)
          ? encodeWorkspacePageCursor({ id: first.id, edge: "before" })
          : undefined,
      }
    }

    const listForward = (limit: number, cursorRow?: WorkspaceRow): WorkspaceRow[] => {
      if (cursorRow === undefined) {
        return database.db
          .select()
          .from(workspaces)
          .orderBy(desc(workspaces.lastUsedAt), asc(workspaces.id))
          .limit(limit)
          .all()
      }

      return database.db
        .select()
        .from(workspaces)
        .where(conditionAfter(cursorRow))
        .orderBy(desc(workspaces.lastUsedAt), asc(workspaces.id))
        .limit(limit)
        .all()
    }

    const listBackward = (limit: number, cursorRow?: WorkspaceRow): WorkspaceRow[] => {
      const rows =
        cursorRow === undefined
          ? database.db
            .select()
            .from(workspaces)
            .orderBy(asc(workspaces.lastUsedAt), desc(workspaces.id))
            .limit(limit)
            .all()
          : database.db
            .select()
            .from(workspaces)
            .where(conditionBefore(cursorRow))
            .orderBy(asc(workspaces.lastUsedAt), desc(workspaces.id))
            .limit(limit)
            .all()

      return [...rows].sort((left, right) => compareWorkspaces(rowToWorkspace(left), rowToWorkspace(right)))
    }

    const searchRows = (query?: string): WorkspaceRow[] => {
      if (query === undefined || query === "") {
        return database.db
          .select()
          .from(workspaces)
          .orderBy(desc(workspaces.lastUsedAt), asc(workspaces.id))
          .all()
      }

      const searchTerm = query.toLowerCase()

      return database.db
        .select()
        .from(workspaces)
        .where(
          or(
            sql`instr(lower(${workspaces.name}), ${searchTerm}) > 0`,
            sql`instr(lower(${workspaces.canonicalPath}), ${searchTerm}) > 0`,
          ),
        )
        .orderBy(desc(workspaces.lastUsedAt), asc(workspaces.id))
        .all()
    }

    const listFiltered = (
      limit: number,
      decodedCursor: WorkspacePageCursorPayload | undefined,
      query?: string,
      state?: Workspace["state"],
    ): ReturnType<ListWorkspaces> => {
      const filtered = searchRows(query)
        .map(rowToWorkspace)
        .filter((workspace) => state === undefined || workspace.state === state)
        .sort(compareWorkspaces)

      const page = paginateFilteredWorkspaces(filtered, limit, decodedCursor)
      if (!page.ok) {
        return { ok: false, error: { kind: "invalid_cursor" } }
      }

      return {
        ok: true,
        value: {
          items: page.value.items,
          limit,
          nextCursor: page.value.nextCursor,
          previousCursor: page.value.previousCursor,
          count: filtered.length,
        },
      }
    }

    return (query) => {
      const limit = query.limit ?? DEFAULT_LIST_LIMIT
      const hasFilters = query.q !== undefined || query.state !== undefined

      const decodedCursor =
        query.cursor === undefined ? undefined : decodeWorkspacePageCursor(query.cursor)

      if (query.cursor !== undefined && !decodedCursor?.ok) {
        return { ok: false, error: { kind: "invalid_cursor" } }
      }

      if (hasFilters) {
        return listFiltered(
          limit,
          decodedCursor?.ok === true ? decodedCursor.value : undefined,
          query.q,
          query.state,
        )
      }

      const cursorRow =
        decodedCursor?.ok === true ? getRowById(database, decodedCursor.value.id) : undefined

      if (decodedCursor?.ok === true && cursorRow === undefined) {
        return { ok: false, error: { kind: "invalid_cursor" } }
      }

      const rows =
        decodedCursor?.ok === true && decodedCursor.value.edge === "before"
          ? listBackward(limit, cursorRow)
          : listForward(limit, cursorRow)

      const cursors = buildPageCursors(rows)

      return {
        ok: true,
        value: {
          items: rows.map(rowToWorkspace),
          limit,
          nextCursor: cursors.nextCursor,
          previousCursor: cursors.previousCursor,
          count: countAll(),
        },
      }
    }
  }
