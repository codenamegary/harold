import { describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { catalogAgentIds } from "../acp/catalog/generated/catalog.agents.generated"
import { openDatabase } from "./database"
import { bootTestDirectory, registerTestCleanup } from "../test-support/test.harness"
const migrationsFolder = path.join(import.meta.dir, "drizzle")
const ms1MigrationCount = 4
const currentMigrationCount = 10

const tableNames = (sqlite: Database) =>
  sqlite
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .all()
    .map((row) => row.name)

const migrationCount = (sqlite: Database) =>
  sqlite.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM __drizzle_migrations").get()
    ?.count

const createMs1Database = async (dataDir: string) => {
  const databasePath = path.join(dataDir, "harold.db")
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
    const dataDir = await bootTestDirectory()
    const database = openDatabase({ dataDir })
    registerTestCleanup(() => database.close())

    const tables = tableNames(database.sqlite)

    expect(tables).toContain("__drizzle_migrations")
    expect(tables).toContain("workspaces")
    expect(tables).toContain("agent_settings")
    expect(tables).not.toContain("schema_migrations")

    const columns = database.sqlite
      .query<{ name: string }, []>("PRAGMA table_info(workspaces)")
      .all()
      .map((row) => row.name)

    expect(columns).toEqual(["id", "name", "canonical_path", "created_at", "last_used_at"])

    const agentSettingsColumns = database.sqlite
      .query<{ name: string }, []>("PRAGMA table_info(agent_settings)")
      .all()
      .map((row) => row.name)

    expect(agentSettingsColumns).toEqual([
      "agent_id",
      "enabled",
      "path",
      "updated_at",
      "spawn_snapshot",
      "args",
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
  })

  test("drops sessions and events tables", async () => {
    const dataDir = await bootTestDirectory()
    const database = openDatabase({ dataDir })
    registerTestCleanup(() => database.close())

    const tables = tableNames(database.sqlite)
    expect(tables).not.toContain("sessions")
    expect(tables).not.toContain("events")
    expect(tables).toContain("workspaces")
    expect(tables).toContain("devices")
    expect(tables).toContain("archived_acp_sessions")
    expect(migrationCount(database.sqlite)).toBe(currentMigrationCount)
  })

  test("creates archived_acp_sessions with composite primary key", async () => {
    const dataDir = await bootTestDirectory()
    const database = openDatabase({ dataDir })
    registerTestCleanup(() => database.close())

    const columns = database.sqlite
      .query<{ name: string }, []>("PRAGMA table_info(archived_acp_sessions)")
      .all()
      .map((row) => row.name)

    expect(columns).toEqual(["agent_id", "session_id"])

    const tableSql = database.sqlite
      .query<{ sql: string }, []>(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'archived_acp_sessions'",
      )
      .get()?.sql

    expect(tableSql).toContain("PRIMARY KEY")
    expect(tableSql).toContain("agent_id")
    expect(tableSql).toContain("session_id")
  })

  test("creates devices and pairing_codes tables with hash columns only", async () => {
    const dataDir = await bootTestDirectory()
    const database = openDatabase({ dataDir })
    registerTestCleanup(() => database.close())

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

    expect(deviceIndexes).toEqual(["devices_credential_hash_unique", "devices_revoked_at_idx"])

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
  })

  test("applies device tables onto an existing MS1 database", async () => {
    const dataDir = await bootTestDirectory()
    await createMs1Database(dataDir)

    const before = new Database(path.join(dataDir, "harold.db"))

    registerTestCleanup(() => before.close())
    expect(migrationCount(before)).toBe(ms1MigrationCount)
    expect(tableNames(before)).toContain("sessions")
    expect(tableNames(before)).toContain("events")
    expect(tableNames(before)).not.toContain("devices")
    expect(tableNames(before)).not.toContain("pairing_codes")

    const database = openDatabase({ dataDir })

    registerTestCleanup(() => database.close())

    expect(migrationCount(database.sqlite)).toBe(currentMigrationCount)
    expect(tableNames(database.sqlite)).not.toContain("sessions")
    expect(tableNames(database.sqlite)).not.toContain("events")
    expect(tableNames(database.sqlite)).toContain("devices")
    expect(tableNames(database.sqlite)).toContain("pairing_codes")

    const workspace = database.sqlite
      .query<{ id: string; name: string }, []>(
        "SELECT id, name FROM workspaces WHERE id = 'ws_ms1'",
      )
      .get()

    expect(workspace).toEqual({ id: "ws_ms1", name: "MS1 Workspace" })

    const seededAgents = database.sqlite
      .query<{ agent_id: string }, []>("SELECT agent_id FROM agent_settings ORDER BY agent_id")
      .all()
      .map((row) => row.agent_id)

    expect(seededAgents).toEqual(["cursor"])
    expect(seededAgents).not.toContain("claude")
  })

  test("second open is idempotent", async () => {
    const dataDir = await bootTestDirectory()
    const first = openDatabase({ dataDir })
    registerTestCleanup(() => first.close())

    const second = openDatabase({ dataDir })

    registerTestCleanup(() => second.close())

    expect(migrationCount(second.sqlite)).toBe(currentMigrationCount)
  })
})

describe("openDatabase", () => {
  test("creates data dir, opens harold.db, and enables WAL", async () => {
    const dataDir = await bootTestDirectory()
    const database = openDatabase({ dataDir })
    registerTestCleanup(() => database.close())

    expect(database.path).toBe(path.join(dataDir, "harold.db"))

    const journalMode = database.sqlite
      .query<{ journal_mode: string }, []>("PRAGMA journal_mode")
      .get()?.journal_mode

    expect(journalMode).toBe("wal")
  })

  test("reuses an existing database file in the data dir", async () => {
    const dataDir = await bootTestDirectory()
    const first = openDatabase({ dataDir })
    registerTestCleanup(() => first.close())

    const second = openDatabase({ dataDir })

    registerTestCleanup(() => second.close())

    expect(migrationCount(second.sqlite)).toBe(currentMigrationCount)
  })

  test("throws when the data dir cannot be created", async () => {
    const parentDir = await bootTestDirectory()
    const blockedPath = path.join(parentDir, "blocked")
    await writeFile(blockedPath, "not a directory")

    expect(() => openDatabase({ dataDir: path.join(blockedPath, "nested") })).toThrow()
  })
})
