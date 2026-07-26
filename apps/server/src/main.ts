import packageJson from "../package.json"
import { createServer } from "./bootstrap/create-server"
import { listen, registerShutdown } from "./bootstrap/shutdown"
import { parseConfig } from "./config/config"
import { openDatabase } from "./persistence/open-database"
import { createRuntime } from "./runtime/runtime"

const main = async () => {
  const config = parseConfig(process.env)
  const database = openDatabase({ dataDir: config.dataDir })
  const runtime = createRuntime(packageJson.version)
  const app = await createServer({ config, runtime })

  registerShutdown(app, runtime, database)
  await listen(app, config, runtime)
  app.log.info(
    { host: config.host, port: config.port, dataDir: config.dataDir },
    "agent server listening",
  )
}

main().catch((error: unknown) => {
  if (
    error instanceof Error &&
    "version" in error &&
    typeof error.version === "number"
  ) {
    console.error({ err: error, migrationVersion: error.version }, "migration failed")
  } else {
    console.error(error)
  }

  process.exit(1)
})
