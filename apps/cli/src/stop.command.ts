import { Command } from "commander"
import pc from "picocolors"
import {
  daemonStateFilePath,
  makeDaemonStateFileStore,
  makeNodeProcessAlive,
  makeNodeRequestStop,
} from "core/daemon-state/node.adapters"
import { makeReadLiveDaemonState } from "core/daemon-state/read.live.usecase"
import { StopLiveDaemon, makeStopLiveDaemon } from "core/daemon-state/stop.usecase"
import { parseConfig } from "server/config"

export type StopCommandDeps = Readonly<{
  stopLiveDaemon: StopLiveDaemon
  writeOut: (line: string) => void
  writeErr: (line: string) => void
}>

const defaultStopCommandDeps = (): StopCommandDeps => {
  const config = parseConfig(process.env)
  const readLiveDaemonState = makeReadLiveDaemonState({
    readDaemonState: makeDaemonStateFileStore({
      path: daemonStateFilePath(config.dataDir),
    }).read,
    isProcessAlive: makeNodeProcessAlive(),
  })

  return {
    stopLiveDaemon: makeStopLiveDaemon({
      readLiveDaemonState,
      requestStop: makeNodeRequestStop(),
      now: () => Date.now(),
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    }),
    writeOut: (line) => console.log(line),
    writeErr: (line) => console.error(pc.red(line)),
  }
}

export const executeStop = async (deps: StopCommandDeps): Promise<number> => {
  const result = await deps.stopLiveDaemon()

  if (result.ok) {
    deps.writeOut(`Harold stopped (pid ${result.value.pid}).`)
    return 0
  }

  switch (result.error.kind) {
    case "not_running":
      deps.writeOut("Harold is not running.")
      return 0
    case "stale_heartbeat":
      deps.writeErr(
        `Refusing to stop pid ${result.error.pid}: daemon-state.json is ${Math.round(
          result.error.ageMs / 1000,
        )}s stale. Remove the state file if the daemon is gone.`,
      )
      return 1
    case "timeout":
      deps.writeErr(`Harold did not stop (pid ${result.error.pid}).`)
      return 1
  }
}

export const makeStopCommand = (overrides: Partial<StopCommandDeps> = {}): Command => {
  const command = new Command("stop")
  command.description("stop the running Harold daemon")
  command.action(async () => {
    process.exitCode = await executeStop({ ...defaultStopCommandDeps(), ...overrides })
  })

  return command
}
