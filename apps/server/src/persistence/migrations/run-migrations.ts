import { Database } from "bun:sqlite"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

export type MigrationFile = {
  version: number
  filename: string
  sql: string
}

export type RunMigrationsOptions = {
  migrationsDir?: string
}

export type MigrationFailure = Error & {
  version: number
}

export const migrationFailure = (
  version: number,
  cause: unknown,
): MigrationFailure => {
  const message =
    cause instanceof Error
      ? `Migration ${version} failed: ${cause.message}`
      : `Migration ${version} failed`

  const error = new Error(message) as MigrationFailure
  error.version = version
  error.cause = cause
  return error
}

const migrationVersionFromFilename = (filename: string): number | null => {
  const match = filename.match(/^(\d+)_.+\.sql$/)

  return match ? Number.parseInt(match[1] ?? "", 10) : null
}

export const readMigrationFiles = (migrationsDir: string): MigrationFile[] =>
  readdirSync(migrationsDir)
    .map((filename) => {
      const version = migrationVersionFromFilename(filename)

      if (version === null) {
        return null
      }

      return {
        version,
        filename,
        sql: readFileSync(path.join(migrationsDir, filename), "utf8"),
      }
    })
    .filter((migration): migration is MigrationFile => migration !== null)
    .sort((left, right) => left.version - right.version)

const appliedVersions = (db: Database): Set<number> => {
  const rows = db
    .query<{ version: number }, []>("SELECT version FROM schema_migrations")
    .all()

  return new Set(rows.map((row) => row.version))
}

export const runMigrations = (
  db: Database,
  options: RunMigrationsOptions = {},
): number[] => {
  const migrationsDir = options.migrationsDir ?? import.meta.dir
  const migrations = readMigrationFiles(migrationsDir)

  db.run(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)",
  )

  const applied = appliedVersions(db)
  const pending = migrations.filter((migration) => !applied.has(migration.version))

  if (pending.length === 0) {
    return []
  }

  const appliedVersionsList: number[] = []

  db.transaction(() => {
    pending.forEach((migration) => {
      try {
        db.run(migration.sql)
        db.run("INSERT INTO schema_migrations (version) VALUES (?)", [
          migration.version,
        ])
        appliedVersionsList.push(migration.version)
      } catch (error: unknown) {
        throw migrationFailure(migration.version, error)
      }
    })
  })()

  return appliedVersionsList
}
