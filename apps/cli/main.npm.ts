#!/usr/bin/env bun
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runServer } from "server/bootstrap"
import { extractMigrationFiles } from "../server/src/persistence/migrations/migrations.extract"
import { embeddedMigrationEntries } from "../server/.generated/migrations.generated"
import { makeHaroldProgram } from "./src/harold.program"

// The bundled CLI carries no drizzle folder, so the daemon's default
// migrations path cannot resolve. Extract the migrations embedded at
// build time into a scratch dir and hand that to the server instead.
const runServerWithEmbeddedMigrations = async (): Promise<void> => {
  const migrationsFolder = await mkdtemp(path.join(os.tmpdir(), "harold-migrations-"))
  await extractMigrationFiles(
    embeddedMigrationEntries.map((entry) => ({
      name: entry.name,
      body: Buffer.from(entry.base64, "base64"),
    })),
    migrationsFolder,
  )
  await runServer({ migrationsFolder })
}

await makeHaroldProgram({ serve: { runServer: runServerWithEmbeddedMigrations } })
  .parseAsync(process.argv)
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
