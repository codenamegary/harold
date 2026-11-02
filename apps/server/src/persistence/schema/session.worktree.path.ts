import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const sessionWorktreePath = sqliteTable(
  "session_worktree_path",
  {
    agentId: text("agent_id").notNull(),
    sessionId: text("session_id").notNull(),
    worktreePath: text("worktree_path").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.sessionId] })],
)
