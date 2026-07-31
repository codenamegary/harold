import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    platform: text("platform"),
    credentialHash: text("credential_hash").notNull(),
    pairedAt: text("paired_at").notNull(),
    lastSeenAt: text("last_seen_at"),
    revokedAt: text("revoked_at"),
  },
  (table) => [
    uniqueIndex("devices_credential_hash_unique").on(table.credentialHash),
    index("devices_revoked_at_idx").on(table.revokedAt),
  ],
)
