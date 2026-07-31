import { and, asc, count, desc, eq, gt, lt, or, sql } from "drizzle-orm"
import { AgentId, AgentIdSchema } from "contracts/http/agent-settings"
import { Session, SessionState, SessionStateSchema, UpdateSessionBody } from "contracts/http/session"
import { AgentDatabase, DbExecutor } from "../persistence/database"
import { sessions } from "../persistence/schema/sessions"
import { createSessionId } from "./create-session-id"
import { SessionRepositoryError } from "./session-errors"
import {
  decodeSessionPageCursor,
  encodeSessionPageCursor,
} from "./session-page-cursor"

export type SessionRepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SessionRepositoryError }

export type CreateSessionInput = {
  workspaceId: string
  agentId: AgentId
  name: string
  acpSessionId: string
  state?: SessionState
  executor?: DbExecutor
}

export type SessionListOptions = {
  workspaceId: string
  limit?: number
  cursor?: string
}

export type GetSessionByIdInput = {
  id: string
}

export type RenameSessionInput = {
  id: string
  executor?: DbExecutor
} & UpdateSessionBody

export type ArchiveSessionInput = {
  id: string
  executor?: DbExecutor
}

export type SelectSessionInput = {
  id: string
  lastUsedAt?: string
  executor?: DbExecutor
}

export type MarkSessionReadyInput = {
  id: string
  acpSessionId: string
  resumable: boolean
  executor?: DbExecutor
}

export type MarkSessionErrorInput = {
  id: string
  executor?: DbExecutor
}

export type SetSessionStateInput = {
  id: string
  state: SessionState
  executor?: DbExecutor
}

export type GetSessionAcpBindingInput = {
  id: string
}

export type ListLiveSessionsByWorkspaceInput = {
  workspaceId: string
}

export type LiveSessionBinding = {
  id: string
  acpSessionId: string
  agentId: AgentId
}

export type SessionAcpBinding = {
  acpSessionId: string
  resumable: boolean
  agentId: AgentId
  workspaceId: string
  archivedAt: string | null
}

export type SessionListPage = {
  items: Session[]
  limit: number
  nextCursor?: string
  previousCursor?: string
  count: number
}

export type SessionListResult =
  | { ok: true; value: SessionListPage }
  | { ok: false; error: { kind: "invalid_cursor" } }

type SessionRow = typeof sessions.$inferSelect

const DEFAULT_LIST_LIMIT = 100

const rowToSession = (row: SessionRow): Session => ({
  id: row.id,
  workspaceId: row.workspaceId,
  agentId: AgentIdSchema.parse(row.agentId),
  name: row.name,
  state: SessionStateSchema.parse(row.state),
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
  archivedAt: row.archivedAt,
})

const compareSessions = (left: Session, right: Session): number => {
  const lastUsedCompare = right.lastUsedAt.localeCompare(left.lastUsedAt)
  return lastUsedCompare === 0 ? left.id.localeCompare(right.id) : lastUsedCompare
}

const nowIso = (): string => new Date().toISOString()

export const createSessionRepository = (database: AgentDatabase) => {
  const resolveExecutor = (executor?: DbExecutor): DbExecutor => executor ?? database.db

  const countByWorkspace = (workspaceId: string): number =>
    database.db
      .select({ value: count() })
      .from(sessions)
      .where(eq(sessions.workspaceId, workspaceId))
      .get()?.value ?? 0

  const getRowById = (id: string): SessionRow | undefined =>
    database.db.select().from(sessions).where(eq(sessions.id, id)).get()

  const workspaceScope = (workspaceId: string) => eq(sessions.workspaceId, workspaceId)

  const conditionAfter = (row: SessionRow) =>
    or(
      lt(sessions.lastUsedAt, row.lastUsedAt),
      and(eq(sessions.lastUsedAt, row.lastUsedAt), gt(sessions.id, row.id)),
    )

  const conditionBefore = (row: SessionRow) =>
    or(
      gt(sessions.lastUsedAt, row.lastUsedAt),
      and(eq(sessions.lastUsedAt, row.lastUsedAt), lt(sessions.id, row.id)),
    )

  const hasMoreAfter = (workspaceId: string, row: SessionRow): boolean =>
    database.db
      .select()
      .from(sessions)
      .where(and(workspaceScope(workspaceId), conditionAfter(row)))
      .orderBy(desc(sessions.lastUsedAt), asc(sessions.id))
      .limit(1)
      .get() !== undefined

  const hasMoreBefore = (workspaceId: string, row: SessionRow): boolean =>
    database.db
      .select()
      .from(sessions)
      .where(and(workspaceScope(workspaceId), conditionBefore(row)))
      .orderBy(asc(sessions.lastUsedAt), desc(sessions.id))
      .limit(1)
      .get() !== undefined

  const buildPageCursors = (workspaceId: string, rows: SessionRow[]) => {
    if (rows.length === 0) {
      return { nextCursor: undefined, previousCursor: undefined }
    }

    const first = rows[0]
    const last = rows[rows.length - 1]

    return {
      nextCursor: hasMoreAfter(workspaceId, last)
        ? encodeSessionPageCursor({ id: last.id, edge: "after" })
        : undefined,
      previousCursor: hasMoreBefore(workspaceId, first)
        ? encodeSessionPageCursor({ id: first.id, edge: "before" })
        : undefined,
    }
  }

  const listForward = (
    workspaceId: string,
    limit: number,
    cursorRow?: SessionRow,
  ): SessionRow[] => {
    if (cursorRow === undefined) {
      return database.db
        .select()
        .from(sessions)
        .where(workspaceScope(workspaceId))
        .orderBy(desc(sessions.lastUsedAt), asc(sessions.id))
        .limit(limit)
        .all()
    }

    return database.db
      .select()
      .from(sessions)
      .where(and(workspaceScope(workspaceId), conditionAfter(cursorRow)))
      .orderBy(desc(sessions.lastUsedAt), asc(sessions.id))
      .limit(limit)
      .all()
  }

  const listBackward = (
    workspaceId: string,
    limit: number,
    cursorRow?: SessionRow,
  ): SessionRow[] => {
    const rows =
      cursorRow === undefined
        ? database.db
            .select()
            .from(sessions)
            .where(workspaceScope(workspaceId))
            .orderBy(asc(sessions.lastUsedAt), desc(sessions.id))
            .limit(limit)
            .all()
        : database.db
            .select()
            .from(sessions)
            .where(and(workspaceScope(workspaceId), conditionBefore(cursorRow)))
            .orderBy(asc(sessions.lastUsedAt), desc(sessions.id))
            .limit(limit)
            .all()

    return [...rows].sort((left, right) => compareSessions(rowToSession(left), rowToSession(right)))
  }

  const create = (input: CreateSessionInput): SessionRepositoryResult<Session> => {
    const db = resolveExecutor(input.executor)
    const timestamp = nowIso()
    const id = createSessionId()
    const state = input.state ?? "idle"

    db
      .insert(sessions)
      .values({
        id,
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        name: input.name,
        state,
        acpSessionId: input.acpSessionId,
        createdAt: timestamp,
        lastUsedAt: timestamp,
        archivedAt: null,
        resumable: false,
      })
      .run()

    return {
      ok: true,
      value: rowToSession({
        id,
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        name: input.name,
        state,
        acpSessionId: input.acpSessionId,
        createdAt: timestamp,
        lastUsedAt: timestamp,
        archivedAt: null,
        resumable: false,
      }),
    }
  }

  const list = (options: SessionListOptions): SessionListResult => {
    const limit = options.limit ?? DEFAULT_LIST_LIMIT
    const decodedCursor =
      options.cursor === undefined ? undefined : decodeSessionPageCursor(options.cursor)

    if (options.cursor !== undefined && decodedCursor?.ok !== true) {
      return { ok: false, error: { kind: "invalid_cursor" } }
    }

    const cursorRow =
      decodedCursor?.ok === true ? getRowById(decodedCursor.value.id) : undefined

    if (
      decodedCursor?.ok === true &&
      (cursorRow === undefined || cursorRow.workspaceId !== options.workspaceId)
    ) {
      return { ok: false, error: { kind: "invalid_cursor" } }
    }

    const rows =
      decodedCursor?.ok === true && decodedCursor.value.edge === "before"
        ? listBackward(options.workspaceId, limit, cursorRow)
        : listForward(options.workspaceId, limit, cursorRow)

    const cursors = buildPageCursors(options.workspaceId, rows)

    return {
      ok: true,
      value: {
        items: rows.map(rowToSession),
        limit,
        nextCursor: cursors.nextCursor,
        previousCursor: cursors.previousCursor,
        count: countByWorkspace(options.workspaceId),
      },
    }
  }

  const getById = ({ id }: GetSessionByIdInput): SessionRepositoryResult<Session> => {
    const row = getRowById(id)

    if (row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    return { ok: true, value: rowToSession(row) }
  }

  const rename = ({ id, name, executor }: RenameSessionInput): SessionRepositoryResult<Session> => {
    const db = resolveExecutor(executor)
    const row = db
      .update(sessions)
      .set({ name })
      .where(eq(sessions.id, id))
      .returning()
      .get()

    if (row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    return { ok: true, value: rowToSession(row) }
  }

  const select = ({
    id,
    lastUsedAt,
    executor,
  }: SelectSessionInput): SessionRepositoryResult<Session> => {
    const db = resolveExecutor(executor)
    const timestamp = lastUsedAt ?? nowIso()
    const row = db
      .update(sessions)
      .set({ lastUsedAt: timestamp })
      .where(eq(sessions.id, id))
      .returning()
      .get()

    if (row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    return { ok: true, value: rowToSession(row) }
  }

  const markReady = ({
    id,
    acpSessionId,
    resumable,
    executor,
  }: MarkSessionReadyInput): SessionRepositoryResult<Session> => {
    const db = resolveExecutor(executor)
    const row = db
      .update(sessions)
      .set({ acpSessionId, state: "idle", resumable })
      .where(eq(sessions.id, id))
      .returning()
      .get()

    if (row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    return { ok: true, value: rowToSession(row) }
  }

  const markError = ({ id, executor }: MarkSessionErrorInput): SessionRepositoryResult<Session> => {
    const db = resolveExecutor(executor)
    const row = db
      .update(sessions)
      .set({ state: "error", resumable: false })
      .where(eq(sessions.id, id))
      .returning()
      .get()

    if (row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    return { ok: true, value: rowToSession(row) }
  }

  const setState = ({
    id,
    state,
    executor,
  }: SetSessionStateInput): SessionRepositoryResult<Session> => {
    const db = resolveExecutor(executor)
    const row = db
      .update(sessions)
      .set({ state })
      .where(eq(sessions.id, id))
      .returning()
      .get()

    if (row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    return { ok: true, value: rowToSession(row) }
  }

  const getAcpBinding = ({
    id,
  }: GetSessionAcpBindingInput): SessionRepositoryResult<SessionAcpBinding> => {
    const row = getRowById(id)

    if (row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    return {
      ok: true,
      value: {
        acpSessionId: row.acpSessionId,
        resumable: row.resumable,
        agentId: AgentIdSchema.parse(row.agentId),
        workspaceId: row.workspaceId,
        archivedAt: row.archivedAt,
      },
    }
  }

  const archive = ({ id, executor }: ArchiveSessionInput): SessionRepositoryResult<Session> => {
    const db = resolveExecutor(executor)
    const timestamp = nowIso()
    const row = db
      .update(sessions)
      .set({ state: "archived", archivedAt: timestamp })
      .where(eq(sessions.id, id))
      .returning()
      .get()

    if (row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    return { ok: true, value: rowToSession(row) }
  }

  const listLiveByWorkspace = ({
    workspaceId,
  }: ListLiveSessionsByWorkspaceInput): LiveSessionBinding[] =>
    database.db
      .select({
        id: sessions.id,
        acpSessionId: sessions.acpSessionId,
        agentId: sessions.agentId,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.workspaceId, workspaceId),
          sql`${sessions.archivedAt} IS NULL`,
          sql`${sessions.state} != 'archived'`,
          sql`${sessions.acpSessionId} != 'pending'`,
        ),
      )
      .all()
      .map((row) => ({
        id: row.id,
        acpSessionId: row.acpSessionId,
        agentId: AgentIdSchema.parse(row.agentId),
      }))

  const listLiveNonArchived = (): Session[] =>
    database.db
      .select()
      .from(sessions)
      .where(
        and(
          sql`${sessions.archivedAt} IS NULL`,
          sql`${sessions.state} != 'archived'`,
        ),
      )
      .all()
      .map(rowToSession)

  return {
    create,
    list,
    getById,
    rename,
    select,
    archive,
    markReady,
    markError,
    setState,
    getAcpBinding,
    listLiveByWorkspace,
    listLiveNonArchived,
  }
}

export type SessionRepository = ReturnType<typeof createSessionRepository>
