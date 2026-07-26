import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { workspaces } from "./workspaces"

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  state: text("state").notNull(),
  acpSessionId: text("acp_session_id").notNull(),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at").notNull(),
  archivedAt: text("archived_at"),
  resumable: integer("resumable", { mode: "boolean" }).notNull().default(false),
})
