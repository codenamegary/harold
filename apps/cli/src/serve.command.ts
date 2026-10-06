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
import { parseConfig } from "server/config"
import { readRunningView, renderRunningView, RunningView, RunningViewColors } from "./running.view"

export type ServeDeps = Readonly<{
  readLiveDaemonState: ReadLiveDaemonState
  runServer: () => Promise<void>
  isInteractive: () => boolean
  readRunningView: () => RunningView
  writeOut: (line: string) => void
  writeWarn: (message: string) => void
  colors: RunningViewColors
}>

const openServeDeps = (): ServeDeps => {
  const config = parseConfig(process.env)

  return {
    readLiveDaemonState: makeReadLiveDaemonState({
      readDaemonState: makeDaemonStateFileStore({
        path: daemonStateFilePath(config.dataDir),
      }).read,
      isProcessAlive: makeNodeProcessAlive(),
    }),
    runServer,
    isInteractive: () => process.stdin.isTTY === true && process.stdout.isTTY === true,
    readRunningView: () => readRunningView(config),
    writeOut: (line) => console.log(line),
    writeWarn: (message) => log.warn(message),
    colors: pc,
  }
}

/**
 * Serves the daemon. The listener is confirmed before any output: runServer
 * resolves once the bind succeeds. Interactive terminals get the running
 * view (summary plus one next step), scripts get a single confirmation line.
 * The wizard never runs here. Setup owns configuration.
 */
const executeServe = async (deps: ServeDeps): Promise<number> => {
  const running = deps.readLiveDaemonState()
  if (running.ok) {
    deps.writeWarn(`Harold looks already running (pid ${running.state.pid}).`)
    return 1
  }

  await deps.runServer()
  const view = deps.readRunningView()

  if (deps.isInteractive()) {
    deps.writeOut(renderRunningView(view, deps.colors))
    return 0
  }

  deps.writeOut(
    `Harold listening at http://${view.summary.localApi.host}:${view.summary.localApi.port}`,
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
