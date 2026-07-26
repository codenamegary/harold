import { afterEach, describe, expect, test } from "bun:test"
import { Database } from "bun:sqlite"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { openDatabase } from "./open-database"
import { runMigrations } from "./migrations/run-migrations"

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-test-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("runMigrations", () => {
  test("creates schema_migrations and applies 001 workspaces", () => {
    const db = new Database(":memory:")
    const applied = runMigrations(db)

    expect(applied).toEqual([1])

    const tables = db
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name)

    expect(tables).toContain("schema_migrations")
    expect(tables).toContain("workspaces")

    const columns = db
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

    const versions = db
      .query<{ version: number }, []>("SELECT version FROM schema_migrations ORDER BY version")
      .all()
      .map((row) => row.version)

    expect(versions).toEqual([1])
  })

  test("second run applies zero new migrations", () => {
    const db = new Database(":memory:")
    const first = runMigrations(db)
    const second = runMigrations(db)

    expect(first).toEqual([1])
    expect(second).toEqual([])
  })

  test("throws with migration version when SQL fails", async () => {
    const migrationsDir = await createTempDataDir()
    await writeFile(
      path.join(migrationsDir, "002_bad.sql"),
      "NOT VALID SQL;",
    )

    const db = new Database(":memory:")
    runMigrations(db)

    expect(() => runMigrations(db, { migrationsDir })).toThrow(/migration 2/i)
  })
})

describe("openDatabase", () => {
  test("creates data dir, opens agent-server.db, and enables WAL", async () => {
    const dataDir = await createTempDataDir()
    const database = openDatabase({ dataDir })

    expect(database.path).toBe(path.join(dataDir, "agent-server.db"))

    const journalMode = database.db
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

    const versions = second.db
      .query<{ version: number }, []>("SELECT version FROM schema_migrations")
      .all()
      .map((row) => row.version)

    expect(versions).toEqual([1])
    second.close()
  })
})
