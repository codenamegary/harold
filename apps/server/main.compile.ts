import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { runServer } from "./src/bootstrap/run.server"
import { extractMigrationFiles } from "./src/persistence/migrations/migrations.extract"
import { embeddedMigrationEntries } from "./.generated/migrations.generated"
import { consoleAssetEntries } from "./.generated/console.assets.generated"

const migrationsDir = await mkdtemp(path.join(os.tmpdir(), "agent-server-migrations-"))
await extractMigrationFiles(
  embeddedMigrationEntries.map((entry) => ({
    name: entry.name,
    body: Buffer.from(entry.base64, "base64"),
  })),
  migrationsDir,
)

const consoleAssets = consoleAssetEntries.map((entry) => ({
  path: entry.path,
  body: new Uint8Array(Buffer.from(entry.base64, "base64")),
}))

await runServer({ consoleAssets, migrationsFolder: migrationsDir })
