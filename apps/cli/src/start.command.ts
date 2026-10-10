import { Command } from "commander"
import pc from "picocolors"
import {
  daemonStateFilePath,
  makeDaemonStateFileStore,
  makeNodeProcessAlive,
} from "core/daemon-state/node.adapters"
import { makeReadLiveDaemonState, ReadLiveDaemonState } from "core/daemon-state/read.live.usecase"
import { parseConfig } from "server/config"
import {
  StartBackgroundDaemon,
  StartBackgroundDaemonError,
  makeBunSpawnBackgroundDaemon,
  makeStartBackgroundDaemon,
  renderStartDaemonError,
} from "./daemon.background"
import { readRunningView, renderRunningView, RunningView, RunningViewColors } from "./running.view"
import { renderStatusSummary } from "./status.render"

export type StartDeps = Readonly<{
  readLiveDaemonState: ReadLiveDaemonState
  startDaemon: StartBackgroundDaemon
  renderStartError: (error: StartBackgroundDaemonError) => string
  readRunningView: () => RunningView
  writeOut: (line: string) => void
  writeErr: (line: string) => void
  colors: RunningViewColors
}>

const openStartDeps = (): StartDeps => {
  const config = parseConfig(process.env)
  const readLiveDaemonState = makeReadLiveDaemonState({
    readDaemonState: makeDaemonStateFileStore({
      path: daemonStateFilePath(config.dataDir),
    }).read,
    isProcessAlive: makeNodeProcessAlive(),
  })
  const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  return {
    readLiveDaemonState,
    startDaemon: makeStartBackgroundDaemon({
      spawn: makeBunSpawnBackgroundDaemon({
        execPath: process.execPath,
        entry: Bun.main,
        env: process.env,
      }),
      readLiveDaemonState,
      now: () => Date.now(),
      sleep,
    }),
    renderStartError: (error) => renderStartDaemonError(error, config.port, "harold start"),
    readRunningView: () => readRunningView(config),
    writeOut: (line) => console.log(line),
    writeErr: (line) => console.error(line),
    colors: pc,
  }
}

/**
 * Starts the daemon and hands the terminal back. A live daemon is a success:
 * the status prints and nothing is spawned. Otherwise the daemon is spawned
 * detached, readiness is confirmed against the state file, and the running
 * view prints before the command exits.
 */
export const executeStart = async (deps: StartDeps): Promise<number> => {
  const running = deps.readLiveDaemonState()
  if (running.ok) {
    deps.writeOut(deps.colors.bold(`Harold is already running (pid ${running.state.pid}).`))
    deps.writeOut(renderStatusSummary(deps.readRunningView().summary))
    return 0
  }

  const started = await deps.startDaemon()
  if (!started.ok) {
    deps.writeErr(deps.renderStartError(started.error))
    return 1
  }

  deps.writeOut(renderRunningView(deps.readRunningView(), deps.colors))
  return 0
}

export const makeStartCommand = (overrides: Partial<StartDeps> = {}): Command => {
  const command = new Command("start")
  command.description("start the Harold daemon in the background")

  command.action(async () => {
    process.exitCode = await executeStart({ ...openStartDeps(), ...overrides })
  })

  return command
}
