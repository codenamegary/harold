import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runServer } from "./src/bootstrap/run.server"
import { extractMigrationFiles } from "./src/persistence/migrations/migrations.extract"
import { embeddedMigrationEntries } from "./.generated/migrations.generated"

const migrationsDir = await mkdtemp(path.join(os.tmpdir(), "harold-migrations-"))
await extractMigrationFiles(
  embeddedMigrationEntries.map((entry) => ({
    name: entry.name,
    body: Buffer.from(entry.base64, "base64"),
  })),
  migrationsDir,
)

await runServer({ migrationsFolder: migrationsDir })
