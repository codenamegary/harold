#!/usr/bin/env bun
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { setDefaultMigrationsFolder } from "server/database"
import { extractMigrationFiles } from "../server/src/persistence/migrations/migrations.extract"
import { embeddedMigrationEntries } from "../server/.generated/migrations.generated"
import { makeHaroldProgram } from "./src/harold.program"

// The bundle carries no drizzle folder next to its entry, so every command
// that opens the database would fail migration lookup. Extract the migrations
// embedded at build time into a scratch dir and register that folder before
// the program runs.
const migrationsFolder = await mkdtemp(path.join(os.tmpdir(), "harold-migrations-"))
await extractMigrationFiles(
  embeddedMigrationEntries.map((entry) => ({
    name: entry.name,
    body: Buffer.from(entry.base64, "base64"),
  })),
  migrationsFolder,
)
setDefaultMigrationsFolder(migrationsFolder)

await makeHaroldProgram()
  .parseAsync(process.argv)
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
