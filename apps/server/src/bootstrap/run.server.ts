import { createWriteStream } from "node:fs"
import packageJson from "../../package.json"
import { createServer } from "./server"
import { listen, registerShutdown } from "./shutdown"
import { ConfigSchema, parseConfig } from "../config/config"
import { readEnvBindOverrides } from "../config/env.bind.overrides"
import { openDatabase } from "../persistence/database"
import { createAppliedRuntimeSettingsHolder } from "../runtime-settings/applied.runtime.settings"
import {
  makeRuntimeSettingsFileStore,
  seedDefaultsFromConfig,
} from "../runtime-settings/runtime-settings.file.adapters"
import { buildAppliedRuntimeSettings } from "../runtime-settings/resolve.runtime.settings.state"
import { createRuntime } from "../runtime/runtime"
import { ConsoleAsset } from "../console/console.assets"
import { daemonStateFilePath, makeDaemonStateFileStore } from "core/daemon-state/node.adapters"
import { resolveDaemonLogPath } from "core/logs/tail.node.adapters"
import { composeServerGetStatus } from "../status/status.adapters"
import { startDaemonStateWriter } from "../status/daemon.state.writer"

export type RunServerOptions = {
  consoleAssets?: ReadonlyArray<ConsoleAsset>
  migrationsFolder?: string
}

export const runServer = async (options: RunServerOptions = {}) => {
  const envBindOverrides = readEnvBindOverrides(process.env)
  const envConfig = parseConfig(process.env)
  const database = openDatabase({
    dataDir: envConfig.dataDir,
    migrationsFolder: options.migrationsFolder,
  })
  const runtimeSettingsStore = makeRuntimeSettingsFileStore({
    dataDir: envConfig.dataDir,
    seedDefaults: seedDefaultsFromConfig(envConfig),
  })
  const persisted = runtimeSettingsStore.get()
  const appliedRuntimeSettings = createAppliedRuntimeSettingsHolder(
    buildAppliedRuntimeSettings({ persisted, envOverrides: envBindOverrides }),
  )
  const applied = appliedRuntimeSettings.get()
  const config = ConfigSchema.parse({
    host: applied.bindHost,
    port: applied.bindPort,
    dataDir: envConfig.dataDir,
  })
  // The daemon always logs to a file so `harold logs` can tail it from
  // outside the daemon process (ADR-0006). A null logPath means the default
  // file under the data dir, not stdout.
  const logStream = createWriteStream(resolveDaemonLogPath(applied.logPath, envConfig.dataDir), {
    flags: "a",
  })
  const runtime = createRuntime(packageJson.version)
  const { app, acpSupervisor, runtimeStatusService } = await createServer({
    config,
    runtime,
    database,
    runtimeSettingsStore,
    appliedRuntimeSettings,
    envBindOverrides,
    logLevel: persisted.logLevel,
    logStream,
    consoleAssets: options.consoleAssets,
  })

  await listen(app, config, runtimeStatusService)
  app.log.info(
    { host: config.host, port: config.port, dataDir: config.dataDir },
    "harold listening",
  )

  const daemonStateWriter = startDaemonStateWriter({
    getStatus: composeServerGetStatus({ app, runtime, config, acpSupervisor }),
    writeDaemonState: makeDaemonStateFileStore({ path: daemonStateFilePath(config.dataDir) }).write,
    pid: process.pid,
  })
  registerShutdown(app, database, acpSupervisor, runtimeStatusService, { daemonStateWriter })
}
