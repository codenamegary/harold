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
    readRunningView: () => readRunningView(config),
    writeOut: (line) => console.log(line),
    writeWarn: (message) => log.warn(message),
    colors: pc,
  }
}

/**
 * Serves the daemon. The listener is confirmed before any output: runServer
 * resolves once the bind succeeds. The running view is always printed, then
 * the daemon keeps running in the foreground. The wizard never runs here.
 * Setup owns configuration.
 *
 * Agent warm-up happens after the listener is up, in the background: agents
 * spawn and initialize while the daemon already answers, so readiness is the
 * bind rather than the slowest agent process. The session path still starts
 * any agent that is not running yet when a prompt needs it.
 *
 * This command is internal: it is hidden from the operator help and is what
 * `harold start` and `harold setup` re-exec detached as the daemon. The
 * operator-facing command is `harold start`.
 */
const executeServe = async (deps: ServeDeps): Promise<number> => {
  const running = deps.readLiveDaemonState()
  if (running.ok) {
    deps.writeWarn(
      `Harold looks already running (pid ${running.state.pid}). Stop it with \`harold stop\`.`,
    )
    return 1
  }

  await deps.runServer()
  deps.writeOut(renderRunningView(deps.readRunningView(), deps.colors))
  return 0
}

export const makeServeCommand = (overrides: Partial<ServeDeps> = {}): Command => {
  const command = new Command("serve")
  command.description("run the Harold daemon in the foreground")

  command.action(async () => {
    process.exitCode = await executeServe({ ...openServeDeps(), ...overrides })
  })

  return command
}
