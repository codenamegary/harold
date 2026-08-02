import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const runtimeSettings = sqliteTable("runtime_settings", {
  id: integer("id").primaryKey(),
  advertisedUrl: text("advertised_url"),
  trustedProxiesJson: text("trusted_proxies_json").notNull(),
  bindHost: text("bind_host").notNull(),
  bindPort: integer("bind_port").notNull(),
  logLevel: text("log_level").notNull(),
  logPath: text("log_path"),
  allowedRootsJson: text("allowed_roots_json").notNull(),
  updatedAt: text("updated_at").notNull(),
})
