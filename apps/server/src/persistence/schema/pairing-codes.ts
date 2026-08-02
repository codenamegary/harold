import { check, index, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"
import { devices } from "./devices"

export const pairingCodes = sqliteTable(
  "pairing_codes",
  {
    id: text("id").primaryKey(),
    codeHash: text("code_hash").notNull(),
    state: text("state").notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    claimedAt: text("claimed_at"),
    deviceId: text("device_id").references(() => devices.id),
  },
  (table) => [
    check(
      "pairing_codes_state_valid",
      sql`${table.state} IN ('active', 'claimed', 'expired', 'revoked')`,
    ),
    index("pairing_codes_state_expires_at_idx").on(table.state, table.expiresAt),
    index("pairing_codes_device_id_idx").on(table.deviceId),
  ],
)
