import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import * as schema from "./schema/schema"

export type AgentDatabase = {
  db: ReturnType<typeof drizzle<typeof schema>>
  sqlite: Database
  path: string
  close: () => void
}

type DrizzleDb = AgentDatabase["db"]
type TransactionExecutor = Parameters<Parameters<DrizzleDb["transaction"]>[0]>[0]

export type DbExecutor = DrizzleDb | TransactionExecutor

export type OpenDatabaseOptions = {
  dataDir: string
}

const databaseFileName = "agent-server.db"
const migrationsFolder = path.join(import.meta.dir, "drizzle")

export const openDatabase = (options: OpenDatabaseOptions): AgentDatabase => {
  mkdirSync(options.dataDir, { recursive: true })

  const databasePath = path.join(options.dataDir, databaseFileName)
  const sqlite = new Database(databasePath)

  sqlite.run("PRAGMA journal_mode = WAL")
  sqlite.run("PRAGMA foreign_keys = ON")

  const db = drizzle({ client: sqlite, schema })

  try {
    migrate(db, { migrationsFolder })
  } catch (error: unknown) {
    sqlite.close()
    console.error({ err: error }, "database migration failed")
    throw error
  }

  return {
    db,
    sqlite,
    path: databasePath,
    close: () => {
      sqlite.close()
    },
  }
}
