import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import { sql } from "drizzle-orm"

export const events = sqliteTable(
  "events",
  {
    cursor: integer("cursor").primaryKey({ autoIncrement: true }),
    schemaVersion: integer("schema_version").notNull(),
    kind: text("kind").notNull(),
    occurredAt: text("occurred_at").notNull(),
    workspaceId: text("workspace_id"),
    sessionId: text("session_id"),
    sessionSequence: integer("session_sequence"),
    turnId: text("turn_id"),
    protocolVersion: integer("protocol_version"),
    direction: text("direction"),
    method: text("method"),
    phase: text("phase"),
    payload: text("payload").notNull(),
  },
  (table) => [
    check("events_schema_version_positive", sql`${table.schemaVersion} > 0`),
    check(
      "events_session_sequence_positive",
      sql`${table.sessionSequence} IS NULL OR ${table.sessionSequence} > 0`,
    ),
    check("events_payload_json", sql`json_valid(${table.payload})`),
    uniqueIndex("events_session_id_session_sequence_unique").on(
      table.sessionId,
      table.sessionSequence,
    ),
    index("events_workspace_id_cursor_idx").on(table.workspaceId, table.cursor),
    index("events_session_id_cursor_idx").on(table.sessionId, table.cursor),
    index("events_session_id_session_sequence_idx").on(table.sessionId, table.sessionSequence),
    index("events_turn_id_cursor_idx").on(table.turnId, table.cursor),
  ],
)
