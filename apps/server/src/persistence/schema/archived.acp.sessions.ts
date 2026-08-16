import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const archivedAcpSessions = sqliteTable(
  "archived_acp_sessions",
  {
    agentId: text("agent_id").notNull(),
    sessionId: text("session_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.sessionId] })],
)
