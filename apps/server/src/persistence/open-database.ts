import { Database } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import path from "node:path"
import { migrationFailure, runMigrations } from "./migrations/run-migrations"

export type AgentDatabase = {
  db: Database
  path: string
  close: () => void
}

export type OpenDatabaseOptions = {
  dataDir: string
}

const databaseFileName = "agent-server.db"

export const openDatabase = (options: OpenDatabaseOptions): AgentDatabase => {
  mkdirSync(options.dataDir, { recursive: true })

  const databasePath = path.join(options.dataDir, databaseFileName)
  const db = new Database(databasePath)

  db.run("PRAGMA journal_mode = WAL")

  try {
    runMigrations(db)
  } catch (error: unknown) {
    db.close()

    if (
      error instanceof Error &&
      "version" in error &&
      typeof error.version === "number"
    ) {
      throw error
    }

    throw migrationFailure(0, error)
  }

  return {
    db,
    path: databasePath,
    close: () => {
      db.close()
    },
  }
}
