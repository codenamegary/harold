import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { catalogAgentIds } from "../acp/catalog/generated/catalog.agents.generated"
import { openDatabase } from "./database"

const tempDirs: string[] = []
const migrationsFolder = path.join(import.meta.dir, "drizzle")
const ms1MigrationCount = 4
const currentMigrationCount = 6

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-test-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const tableNames = (sqlite: Database) =>
  sqlite
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name)

const migrationCount = (sqlite: Database) =>
  sqlite
    .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM __drizzle_migrations")
    .get()?.count

const createMs1Database = async (dataDir: string) => {
  const databasePath = path.join(dataDir, "agent-server.db")
  const sqlite = new Database(databasePath)
  sqlite.run("PRAGMA foreign_keys = ON")
  sqlite.run(`
    CREATE TABLE __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `)

  const journal = JSON.parse(
    await readFile(path.join(migrationsFolder, "meta/_journal.json"), "utf8"),
  ) as {
    entries: Array<{ tag: string; when: number }>
  }

  for (const entry of journal.entries.slice(0, ms1MigrationCount)) {
    const query = await readFile(path.join(migrationsFolder, `${entry.tag}.sql`), "utf8")
    for (const statement of query.split("--> statement-breakpoint")) {
      const trimmed = statement.trim()
      if (trimmed.length > 0) {
        sqlite.run(trimmed)
      }
    }

    const hash = createHash("sha256").update(query).digest("hex")
    sqlite
      .query("INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)")
      .run(hash, entry.when)
  }

  sqlite
    .query(
      `INSERT INTO workspaces (id, name, canonical_path, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      "ws_ms1",
      "MS1 Workspace",
      "/tmp/ms1-workspace",
      "2026-07-01T00:00:00.000Z",
      "2026-07-01T00:00:00.000Z",
    )

  sqlite.close()
  return databasePath
}

describe("drizzle migrations", () => {
  test("creates __drizzle_migrations and applies workspaces table", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })

    const tables = tableNames(database.sqlite)

    expect(tables).toContain("__drizzle_migrations")
    expect(tables).toContain("workspaces")
    expect(tables).toContain("agent_settings")
    expect(tables).not.toContain("schema_migrations")

    const columns = database.sqlite
      .query<{ name: string }, []>("PRAGMA table_info(workspaces)")
      .all()
      .map((row) => row.name)

    expect(columns).toEqual([
      "id",
      "name",
      "canonical_path",
      "created_at",
      "last_used_at",
    ])

    const agentSettingsColumns = database.sqlite
      .query<{ name: string }, []>("PRAGMA table_info(agent_settings)")
      .all()
      .map((row) => row.name)

    expect(agentSettingsColumns).toEqual([
      "agent_id",
      "enabled",
      "path",
      "updated_at",
    ])

    expect(migrationCount(database.sqlite)).toBe(currentMigrationCount)

    const seededAgents = database.sqlite
      .query<{ agent_id: string; enabled: number }, []>(
        "SELECT agent_id, enabled FROM agent_settings ORDER BY agent_id",
      )
      .all()

    expect(seededAgents).toEqual([{ agent_id: "cursor", enabled: 0 }])
    expect(catalogAgentIds).toContain("cursor")
    expect(catalogAgentIds).toContain("claude-acp")

    database.close()
  })

  test("creates sessions table with resumable default and cascade fk", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })

    const tables = tableNames(database.sqlite)
    expect(tables).toContain("sessions")

    const columns = database.sqlite
      .query<{ name: string; dflt_value: string | null }, []>("PRAGMA table_info(sessions)")
      .all()

    expect(columns.map((row) => row.name)).toEqual([
      "id",
      "workspace_id",
      "agent_id",
      "name",
      "state",
      "acp_session_id",
      "created_at",
      "last_used_at",
      "archived_at",
      "resumable",
    ])

    const resumable = columns.find((row) => row.name === "resumable")
    expect(resumable?.dflt_value).toBe("false")

    const foreignKeys = database.sqlite
      .query<{ table: string; on_delete: string }, []>("PRAGMA foreign_key_list(sessions)")
      .all()

    expect(foreignKeys).toEqual([
      expect.objectContaining({
        table: "workspaces",
        on_delete: "CASCADE",
      }),
    ])

    database.close()
  })

  test("creates events table with constraints and indexes", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })

    const tables = tableNames(database.sqlite)
    expect(tables).toContain("events")

    const columns = database.sqlite
      .query<{ name: string }, []>("PRAGMA table_info(events)")
      .all()
      .map((row) => row.name)

    expect(columns).toEqual([
      "cursor",
      "schema_version",
      "kind",
      "occurred_at",
      "workspace_id",
      "session_id",
      "session_sequence",
      "turn_id",
      "protocol_version",
      "direction",
      "method",
      "phase",
      "payload",
    ])

    const indexes = database.sqlite
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'events' ORDER BY name",
      )
      .all()
      .map((row) => row.name)

    expect(indexes).toEqual([
      "events_session_id_cursor_idx",
      "events_session_id_session_sequence_idx",
      "events_session_id_session_sequence_unique",
      "events_turn_id_cursor_idx",
      "events_workspace_id_cursor_idx",
    ])

    database.close()
  })

  test("creates devices and pairing_codes tables with hash columns only", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })

    const tables = tableNames(database.sqlite)
    expect(tables).toContain("devices")
    expect(tables).toContain("pairing_codes")

    const deviceColumns = database.sqlite
      .query<{ name: string }, []>("PRAGMA table_info(devices)")
      .all()
      .map((row) => row.name)

    expect(deviceColumns).toEqual([
      "id",
      "name",
      "platform",
      "credential_hash",
      "paired_at",
      "last_seen_at",
      "revoked_at",
    ])
    expect(deviceColumns).not.toContain("credential")
    expect(deviceColumns).not.toContain("token")
    expect(deviceColumns).not.toContain("secret")

    const pairingCodeColumns = database.sqlite
      .query<{ name: string }, []>("PRAGMA table_info(pairing_codes)")
      .all()
      .map((row) => row.name)

    expect(pairingCodeColumns).toEqual([
      "id",
      "code_hash",
      "state",
      "created_at",
      "expires_at",
      "claimed_at",
      "device_id",
    ])
    expect(pairingCodeColumns).not.toContain("code")
    expect(pairingCodeColumns).not.toContain("pairing_code")

    const deviceIndexes = database.sqlite
      .query<{ name: string }, []>(
        `SELECT name FROM sqlite_master
         WHERE type = 'index'
           AND tbl_name = 'devices'
           AND name NOT LIKE 'sqlite_autoindex_%'
         ORDER BY name`,
      )
      .all()
      .map((row) => row.name)

    expect(deviceIndexes).toEqual([
      "devices_credential_hash_unique",
      "devices_revoked_at_idx",
    ])

    const pairingCodeIndexes = database.sqlite
      .query<{ name: string }, []>(
        `SELECT name FROM sqlite_master
         WHERE type = 'index'
           AND tbl_name = 'pairing_codes'
           AND name NOT LIKE 'sqlite_autoindex_%'
         ORDER BY name`,
      )
      .all()
      .map((row) => row.name)

    expect(pairingCodeIndexes).toEqual([
      "pairing_codes_device_id_idx",
      "pairing_codes_state_expires_at_idx",
    ])

    const pairingCodeForeignKeys = database.sqlite
      .query<{ table: string; from: string; to: string }, []>(
        "PRAGMA foreign_key_list(pairing_codes)",
      )
      .all()

    expect(pairingCodeForeignKeys).toEqual([
      expect.objectContaining({
        table: "devices",
        from: "device_id",
        to: "id",
      }),
    ])

    database.close()
  })

  test("applies device tables onto an existing MS1 database", async () => {
    const dataDir = await createTempDataDir()
    await createMs1Database(dataDir)

    const before = new Database(path.join(dataDir, "agent-server.db"))
    expect(migrationCount(before)).toBe(ms1MigrationCount)
    expect(tableNames(before)).not.toContain("devices")
    expect(tableNames(before)).not.toContain("pairing_codes")
    before.close()

    const database = openDatabase({ dataDir })

    expect(migrationCount(database.sqlite)).toBe(currentMigrationCount)
    expect(tableNames(database.sqlite)).toContain("devices")
    expect(tableNames(database.sqlite)).toContain("pairing_codes")

    const workspace = database.sqlite
      .query<{ id: string; name: string }, []>(
        "SELECT id, name FROM workspaces WHERE id = 'ws_ms1'",
      )
      .get()

    expect(workspace).toEqual({ id: "ws_ms1", name: "MS1 Workspace" })

    const seededAgents = database.sqlite
      .query<{ agent_id: string }, []>(
        "SELECT agent_id FROM agent_settings ORDER BY agent_id",
      )
      .all()
      .map((row) => row.agent_id)

    expect(seededAgents).toEqual(["cursor"])
    expect(seededAgents).not.toContain("claude")

    database.close()
  })

  test("second open is idempotent", async () => {
    const dataDir = await createTempDataDir()
    const first = openDatabase({ dataDir })
    first.close()

    const second = openDatabase({ dataDir })

    expect(migrationCount(second.sqlite)).toBe(currentMigrationCount)
    second.close()
  })
})

describe("openDatabase", () => {
  test("creates data dir, opens agent-server.db, and enables WAL", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })

    expect(database.path).toBe(path.join(dataDir, "agent-server.db"))

    const journalMode = database.sqlite
      .query<{ journal_mode: string }, []>("PRAGMA journal_mode")
      .get()?.journal_mode

    expect(journalMode).toBe("wal")

    database.close()
  })

  test("reuses an existing database file in the data dir", async () => {
    const dataDir = await createTempDataDir()
    const first = openDatabase({ dataDir })
    first.close()

    const second = openDatabase({ dataDir })

    expect(migrationCount(second.sqlite)).toBe(currentMigrationCount)
    second.close()
  })

  test("throws when the data dir cannot be created", async () => {
    const parentDir = await createTempDataDir()
    const blockedPath = path.join(parentDir, "blocked")
    await writeFile(blockedPath, "not a directory")

    expect(() =>
      openDatabase({ dataDir: path.join(blockedPath, "nested") }),
    ).toThrow()
  })
})
