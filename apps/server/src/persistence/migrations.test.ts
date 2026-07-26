import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { openDatabase } from "./open-database"

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

    const migrationCount = database.sqlite
      .query<{ count: number }, []>("SELECT COUNT(*) AS count FROM __drizzle_migrations")
      .get()?.count

    expect(migrationCount).toBe(1)

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

    expect(migrationCount).toBe(1)
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

    expect(migrationCount).toBe(1)
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
