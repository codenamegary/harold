import { eq } from "drizzle-orm"
import { Workspace } from "contracts/http/workspace"
import { AgentDatabase } from "../persistence/open-database"
import { workspaces } from "../persistence/schema/workspaces"
import { canonicalizeWorkspacePath } from "./canonicalize-workspace-path"
import { createWorkspaceId } from "./create-workspace-id"
import { probeWorkspaceState } from "./probe-workspace-state"
import { WorkspaceRepositoryError } from "./workspace-errors"

export type WorkspaceRepositoryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: WorkspaceRepositoryError }

type WorkspaceRow = typeof workspaces.$inferSelect

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("UNIQUE constraint failed")

const rowToWorkspace = (row: WorkspaceRow): Workspace => ({
  id: row.id,
  name: row.name,
  path: row.canonicalPath,
  state: probeWorkspaceState(row.canonicalPath),
  createdAt: row.createdAt,
  lastUsedAt: row.lastUsedAt,
})

const compareWorkspaceRows = (left: WorkspaceRow, right: WorkspaceRow): number => {
  const lastUsedCompare = right.lastUsedAt.localeCompare(left.lastUsedAt)
  return lastUsedCompare === 0 ? left.id.localeCompare(right.id) : lastUsedCompare
}

const nowIso = (): string => new Date().toISOString()

export const createWorkspaceRepository = (database: AgentDatabase) => {
  const create = (name: string, inputPath: string): WorkspaceRepositoryResult<Workspace> => {
    const canonicalizeResult = canonicalizeWorkspacePath(inputPath)
    if (!canonicalizeResult.ok) {
      return { ok: false, error: { kind: "path", error: canonicalizeResult.error } }
    }

    const timestamp = nowIso()
    const id = createWorkspaceId()

    try {
      database.db
        .insert(workspaces)
        .values({
          id,
          name,
          canonicalPath: canonicalizeResult.canonicalPath,
          createdAt: timestamp,
          lastUsedAt: timestamp,
        })
        .run()
    } catch (error: unknown) {
      if (isUniqueConstraintError(error)) {
        return { ok: false, error: { kind: "duplicate_path" } }
      }
      throw error
    }

    return {
      ok: true,
      value: rowToWorkspace({
        id,
        name,
        canonicalPath: canonicalizeResult.canonicalPath,
        createdAt: timestamp,
        lastUsedAt: timestamp,
      }),
    }
  }

  const list = (): Workspace[] =>
    database.db
      .select()
      .from(workspaces)
      .all()
      .sort(compareWorkspaceRows)
      .map(rowToWorkspace)

  const getById = (id: string): WorkspaceRepositoryResult<Workspace> => {
    const row = database.db.select().from(workspaces).where(eq(workspaces.id, id)).get()

    if (row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    return { ok: true, value: rowToWorkspace(row) }
  }

  const updateName = (id: string, name: string): WorkspaceRepositoryResult<Workspace> => {
    const timestamp = nowIso()
    const row = database.db
      .update(workspaces)
      .set({ name, lastUsedAt: timestamp })
      .where(eq(workspaces.id, id))
      .returning()
      .get()

    if (row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    return { ok: true, value: rowToWorkspace(row) }
  }

  const deleteById = (id: string): WorkspaceRepositoryResult<void> => {
    const row = database.db.delete(workspaces).where(eq(workspaces.id, id)).returning().get()

    if (row === undefined) {
      return { ok: false, error: { kind: "not_found" } }
    }

    return { ok: true, value: undefined }
  }

  return {
    create,
    list,
    getById,
    updateName,
    delete: deleteById,
  }
}

export type WorkspaceRepository = ReturnType<typeof createWorkspaceRepository>
