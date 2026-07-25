import packageJson from "../package.json"
import { createServer } from "./bootstrap/create-server"
import { listen, registerShutdown } from "./bootstrap/shutdown"
import { parseConfig } from "./config/config"
import { createRuntime } from "./runtime/runtime"

const main = async () => {
  const config = parseConfig(process.env)
  const runtime = createRuntime(packageJson.version)
  const app = await createServer({ config, runtime })

  registerShutdown(app, runtime)
  await listen(app, config, runtime)
  app.log.info(
    { host: config.host, port: config.port },
    "relay server listening",
  )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
