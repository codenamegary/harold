import { eq } from "drizzle-orm"
import { Workspace } from "contracts/http/workspace"
import { AgentDatabase } from "../persistence/database"
import { workspaces } from "../persistence/schema/workspaces"
import { createWorkspaceId } from "./workspace.create.workspace.id"
import { FindWorkspaceById, InsertWorkspace } from "./workspace.ports"
import { probeWorkspaceState } from "./workspace.probe.workspace.state"

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

const nowIso = (): string => new Date().toISOString()

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
      const row = database.db.select().from(workspaces).where(eq(workspaces.id, id)).get()
      if (row === undefined) {
        return { ok: false, error: { kind: "not_found" } }
      }

      return { ok: true, value: rowToWorkspace(row) }
    }
