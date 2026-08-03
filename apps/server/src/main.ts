import { createWriteStream } from "node:fs"
import packageJson from "../package.json"
import { createServer } from "./bootstrap/server"
import { listen, registerShutdown } from "./bootstrap/shutdown"
import { ConfigSchema, parseConfig } from "./config/config"
import { openDatabase } from "./persistence/database"
import {
  createRuntimeSettingsRepository,
  seedDefaultsFromConfig,
} from "./runtime-settings/repository"
import { createRuntime } from "./runtime/runtime"

const main = async () => {
  const envConfig = parseConfig(process.env)
  const database = openDatabase({ dataDir: envConfig.dataDir })
  const runtimeSettingsRepository = createRuntimeSettingsRepository({
    dataDir: envConfig.dataDir,
    seedDefaults: seedDefaultsFromConfig(envConfig),
  })
  const runtimeSettings = runtimeSettingsRepository.get()
  const config = ConfigSchema.parse({
    host: runtimeSettings.bindHost,
    port: runtimeSettings.bindPort,
    dataDir: envConfig.dataDir,
  })
  const logStream =
    runtimeSettings.logPath === null
      ? undefined
      : createWriteStream(runtimeSettings.logPath, { flags: "a" })
  const runtime = createRuntime(packageJson.version)
  const {
    app,
    acpSupervisor,
    runtimeStatusService,
    sessionService,
    disposeOfflineOnBindingClear,
  } = await createServer({
    config,
    runtime,
    database,
    runtimeSettingsRepository,
    logLevel: runtimeSettings.logLevel,
    logStream,
  })

  registerShutdown(
    app,
    database,
    acpSupervisor,
    runtimeStatusService,
    sessionService,
    disposeOfflineOnBindingClear,
  )
  await listen(app, config, runtimeStatusService)
  app.log.info(
    { host: config.host, port: config.port, dataDir: config.dataDir },
    "agent server listening",
  )
}

main().catch((error: unknown) => {
  console.error({ err: error }, "agent server failed to start")
  process.exit(1)
})
