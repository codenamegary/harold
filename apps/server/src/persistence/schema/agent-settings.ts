import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const agentSettings = sqliteTable("agent_settings", {
  agentId: text("agent_id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  path: text("path"),
  args: text("args"),
  spawnSnapshot: text("spawn_snapshot"),
  updatedAt: text("updated_at").notNull(),
})
