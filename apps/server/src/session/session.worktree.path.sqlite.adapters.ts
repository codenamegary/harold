import { AgentIdSchema } from "contracts/http/agent-settings"
import { and, eq } from "drizzle-orm"
import { AgentDatabase } from "../persistence/database"
import { sessionWorktreePath } from "../persistence/schema/session.worktree.path"
import {
  ForgetSessionWorktreePath,
  GetSessionWorktreePath,
  ListSessionWorktreePaths,
  SetSessionWorktreePath,
} from "./session.ports"

export type SessionWorktreePathStore = Readonly<{
  get: GetSessionWorktreePath
  list: ListSessionWorktreePaths
  set: SetSessionWorktreePath
  forget: ForgetSessionWorktreePath
}>

export const makeSessionWorktreePathStore = (
  database: AgentDatabase,
): SessionWorktreePathStore => ({
  get: (params) =>
    database.db
      .select({ worktreePath: sessionWorktreePath.worktreePath })
      .from(sessionWorktreePath)
      .where(
        and(
          eq(sessionWorktreePath.agentId, params.agentId),
          eq(sessionWorktreePath.sessionId, params.sessionId),
        ),
      )
      .get()?.worktreePath,
  list: () =>
    database.db
      .select()
      .from(sessionWorktreePath)
      .all()
      .map((row) => ({
        agentId: AgentIdSchema.parse(row.agentId),
        sessionId: row.sessionId,
        worktreePath: row.worktreePath,
      })),
  set: (params) => {
    database.db
      .insert(sessionWorktreePath)
      .values({
        agentId: params.agentId,
        sessionId: params.sessionId,
        worktreePath: params.worktreePath,
        updatedAt: params.updatedAt,
      })
      .onConflictDoUpdate({
        target: [sessionWorktreePath.agentId, sessionWorktreePath.sessionId],
        set: {
          worktreePath: params.worktreePath,
          updatedAt: params.updatedAt,
        },
      })
      .run()
  },
  forget: (params) => {
    database.db
      .delete(sessionWorktreePath)
      .where(
        and(
          eq(sessionWorktreePath.agentId, params.agentId),
          eq(sessionWorktreePath.sessionId, params.sessionId),
        ),
      )
      .run()
  },
})
