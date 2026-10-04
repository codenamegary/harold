import { Command } from "commander"
import pc from "picocolors"
import {
  daemonStateFilePath,
  makeDaemonStateFileStore,
  makeNodeProcessAlive,
} from "core/daemon-state/node.adapters"
import { makeReadLiveDaemonState } from "core/daemon-state/read.live.usecase"
import { parseConfig } from "server/config"
import { renderDaemonNotRunning, renderDaemonStatus } from "./status.render"

export const makeStatusCommand = (): Command => {
  const command = new Command("status")
  command.description("show the running daemon's live status")

  command.action(() => {
    const config = parseConfig(process.env)
    const readLiveDaemonState = makeReadLiveDaemonState({
      readDaemonState: makeDaemonStateFileStore({
        path: daemonStateFilePath(config.dataDir),
      }).read,
      isProcessAlive: makeNodeProcessAlive(),
    })
    const result = readLiveDaemonState()

    if (!result.ok) {
      console.log(pc.red(renderDaemonNotRunning(result.error)))
      if (result.error.kind !== "unreadable_state_file") {
        console.log(pc.dim(`Start it with: ${pc.bold("harold serve")}`))
      }
      process.exitCode = 1
      return
    }

    console.log(
      renderDaemonStatus({
        status: result.state.status,
        pid: result.state.pid,
        colors: pc,
      }),
    )
  })

  return command
}
