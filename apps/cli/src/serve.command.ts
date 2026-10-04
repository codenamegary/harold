import { existsSync } from "node:fs"
import { log } from "@clack/prompts"
import { Command } from "commander"
import pc from "picocolors"
import {
  daemonStateFilePath,
  makeDaemonStateFileStore,
  makeNodeProcessAlive,
} from "core/daemon-state/node.adapters"
import { makeReadLiveDaemonState, ReadLiveDaemonState } from "core/daemon-state/read.live.usecase"
import { runServer } from "server/bootstrap"
import { databasePath } from "server/database"
import { parseConfig } from "server/config"
import { isFreshInstall } from "./install.detect"
import { makeSetupCommandDeps, runSetup as executeSetup } from "./setup.command"
import { SetupOptions } from "./setup.wizard"

export type ServeDeps = Readonly<{
  dataDir: string
  readLiveDaemonState: ReadLiveDaemonState
  isFreshInstall: () => boolean
  isInteractive: () => boolean
  runServer: () => Promise<void>
  runSetup: (options: SetupOptions) => Promise<number>
  writeWarn: (message: string) => void
  writeInfo: (message: string) => void
}>

const freshInstallSetupOptions: SetupOptions = {
  agents: undefined,
  workspace: undefined,
  advertisedUrl: undefined,
  pair: true,
}

const openServeDeps = (): ServeDeps => {
  const config = parseConfig(process.env)

  return {
    dataDir: config.dataDir,
    readLiveDaemonState: makeReadLiveDaemonState({
      readDaemonState: makeDaemonStateFileStore({
        path: daemonStateFilePath(config.dataDir),
      }).read,
      isProcessAlive: makeNodeProcessAlive(),
    }),
    isFreshInstall: () =>
      isFreshInstall({ databasePath: databasePath(config.dataDir), fileExists: existsSync }),
    isInteractive: () => process.stdin.isTTY === true && process.stdout.isTTY === true,
    runServer,
    runSetup: (options) =>
      executeSetup(options, makeSetupCommandDeps({ isInteractive: () => true })),
    writeWarn: (message) => log.warn(message),
    writeInfo: (message) => log.info(message),
  }
}

/**
 * Serves the daemon. On a fresh interactive install the setup wizard runs
 * after the listener is up: reachability verification and the pairing claim
 * both need the daemon answering. Non-interactive installs keep serving with
 * defaults and get a pointer at `harold setup`.
 */
const executeServe = async (deps: ServeDeps): Promise<number> => {
  const running = deps.readLiveDaemonState()
  if (running.ok) {
    deps.writeWarn(`Harold looks already running (pid ${running.state.pid}).`)
    return 1
  }

  const fresh = deps.isFreshInstall()
  await deps.runServer()

  if (!fresh) {
    return 0
  }

  if (deps.isInteractive()) {
    return await deps.runSetup(freshInstallSetupOptions)
  }

  deps.writeWarn(pc.yellow(`Fresh install: no database in ${deps.dataDir} yet.`))
  deps.writeInfo(
    "Serving with defaults. Run `harold setup` to configure agents, workspace, and pairing.",
  )
  return 0
}

export const makeServeCommand = (overrides: Partial<ServeDeps> = {}): Command => {
  const command = new Command("serve")
  command.description("run the Harold daemon (local host server)")

  command.action(async () => {
    process.exitCode = await executeServe({ ...openServeDeps(), ...overrides })
  })

  return command
}
