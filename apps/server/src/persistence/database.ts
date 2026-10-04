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
  migrationsFolder?: string
}

const databaseFileName = "harold.db"
const defaultMigrationsFolder = path.join(import.meta.dir, "drizzle")

export const databasePath = (dataDir: string): string => path.join(dataDir, databaseFileName)

export const openDatabase = (options: OpenDatabaseOptions): AgentDatabase => {
  mkdirSync(options.dataDir, { recursive: true })

  const resolvedPath = databasePath(options.dataDir)
  const sqlite = new Database(resolvedPath)

  sqlite.run("PRAGMA journal_mode = WAL")
  sqlite.run("PRAGMA foreign_keys = ON")

  const db = drizzle({ client: sqlite, schema })

  try {
    migrate(db, {
      migrationsFolder: options.migrationsFolder ?? defaultMigrationsFolder,
    })
  } catch (error: unknown) {
    sqlite.close()
    console.error({ err: error }, "database migration failed")
    throw error
  }

  return {
    db,
    sqlite,
    path: resolvedPath,
    close: () => {
      sqlite.close()
    },
  }
}
