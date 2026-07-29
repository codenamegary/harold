import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { openDatabase } from "./database"

const tempDirs: string[] = []

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

    const migrationCount = database.sqlite
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM __drizzle_migrations")
      .get()?.count

    expect(migrationCount).toBe(4)

    const seededAgents = database.sqlite
      .query<{ agent_id: string; enabled: number }, []>(
        "SELECT agent_id, enabled FROM agent_settings ORDER BY agent_id",
      )
      .all()

    expect(seededAgents).toEqual([
      { agent_id: "claude", enabled: 0 },
      { agent_id: "cursor", enabled: 0 },
    ])

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

  test("second open is idempotent", async () => {
    const dataDir = await createTempDataDir()
    const first = openDatabase({ dataDir })
    first.close()

    const second = openDatabase({ dataDir })

    const migrationCount = second.sqlite
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM __drizzle_migrations")
      .get()?.count

    expect(migrationCount).toBe(4)
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

    const migrationCount = second.sqlite
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM __drizzle_migrations")
      .get()?.count

    expect(migrationCount).toBe(4)
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
