import { createWriteStream } from "node:fs"
import { appendFileSync } from "node:fs"
import cliPackageJson from "../../../cli/package.json"
import { createServer } from "./server"
import { listen, registerShutdown } from "./shutdown"
import { ConfigSchema, DEFAULT_BIND_HOST, parseConfig } from "../config/config"
import { readEnvBindOverrides } from "../config/env.bind.overrides"
import { openDatabase } from "../persistence/database"
import { createAppliedRuntimeSettingsHolder } from "../runtime-settings/applied.runtime.settings"
import {
  makeRuntimeSettingsFileStore,
  seedDefaultsFromConfig,
} from "../runtime-settings/runtime-settings.file.adapters"
import { buildAppliedRuntimeSettings } from "../runtime-settings/resolve.runtime.settings.state"
import { createRuntime } from "../runtime/runtime"
import { daemonStateFilePath, makeDaemonStateFileStore } from "core/daemon-state/node.adapters"
import { resolveDaemonLogPath } from "core/logs/tail.node.adapters"
import { detectNetworkInterfaces, hasDialableAddress } from "core/network/lan.address"
import { composeServerGetStatus } from "../status/status.adapters"
import { startDaemonStateWriter } from "../status/daemon.state.writer"

export type RunServerOptions = {
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
    host: DEFAULT_BIND_HOST,
    port: applied.bindPort,
    dataDir: envConfig.dataDir,
  })
  // The daemon always logs to a file so `harold logs` can tail it from
  // outside the daemon process. Screen output belongs to the CLI:
  // `harold start` prints the running view once the daemon answers.
  // A null logPath means the default file under the data dir.
  const logFilePath = resolveDaemonLogPath(applied.logPath, envConfig.dataDir)
  const logStream = createWriteStream(logFilePath, { flags: "a" })

  // The daemon exists to serve the app. On a machine with no network
  // address at all nothing can ever pair, so refuse to start instead of
  // running a daemon only loopback could reach. The gate is lenient: any
  // non-internal, non-link-local IPv4 address counts, including virtual
  // interfaces like Tailscale.
  if (!hasDialableAddress(detectNetworkInterfaces())) {
    const message = "no network address found. Connect to a network and run `harold start` again."
    try {
      appendFileSync(logFilePath, `${new Date().toISOString()} ${message}\n`, "utf8")
    } catch {
      // the log file is best-effort; the exit below is the visible failure
    }
    logStream.end()
    database.close()
    process.exit(1)
  }

  const runtime = createRuntime(cliPackageJson.version)
  const { app, acpSupervisor, runtimeStatusService, warmAgents } = await createServer({
    config,
    runtime,
    database,
    runtimeSettingsStore,
    appliedRuntimeSettings,
    envBindOverrides,
    logLevel: persisted.logLevel,
    logStream,
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

  // Warm-up stays off the readiness path: the listener and the state file are
  // what tell the CLI the daemon is up, and agents initialize on their own
  // time. Per-agent failures are logged by `startEnabledAgents` itself.
  void warmAgents()
    .then((results) => {
      const ready = results.filter((result) => result.ok).length
      app.log.info({ ready, total: results.length }, "agent warm-up settled")
    })
    .catch((error: unknown) => {
      app.log.error({ err: error }, "agent warm-up failed")
    })
}
