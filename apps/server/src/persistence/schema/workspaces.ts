import { sqliteTable, text } from "drizzle-orm/sqlite-core"

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  canonicalPath: text("canonical_path").notNull().unique(),
  createdAt: text("created_at").notNull(),
  lastUsedAt: text("last_used_at").notNull(),
})
