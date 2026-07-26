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
  const app = await createServer({ config, runtime, database })

  registerShutdown(app, runtime, database)
  await listen(app, config, runtime)
  app.log.info(
    { host: config.host, port: config.port, dataDir: config.dataDir },
    "agent server listening",
  )
}

main().catch((error: unknown) => {
  console.error({ err: error }, "agent server failed to start")
  process.exit(1)
})
