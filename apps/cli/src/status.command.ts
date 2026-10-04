import { Command } from "commander"
import pc from "picocolors"
import {
  daemonStateFilePath,
  makeDaemonStateFileStore,
  makeNodeProcessAlive,
} from "core/daemon-state/node.adapters"
import { makeReadLiveDaemonState } from "core/daemon-state/read.live.usecase"
import { makeGetStatusSummary } from "core/status/summary.usecase"
import { parseConfig } from "server/config"
import { openDatabase } from "server/database"
import { composeStatusSummaryPorts } from "server/status-summary"
import { renderStatus } from "./status.render"

export const makeStatusCommand = (): Command => {
  const command = new Command("status")
  command.description("show Harold's status summary and live daemon state")

  command.action(() => {
    const config = parseConfig(process.env)
    const readLiveDaemonState = makeReadLiveDaemonState({
      readDaemonState: makeDaemonStateFileStore({
        path: daemonStateFilePath(config.dataDir),
      }).read,
      isProcessAlive: makeNodeProcessAlive(),
    })
    const daemon = readLiveDaemonState()

    const database = openDatabase({ dataDir: config.dataDir })
    try {
      const getStatusSummary = makeGetStatusSummary(composeStatusSummaryPorts({ database, config }))
      console.log(renderStatus({ summary: getStatusSummary(), daemon, colors: pc }))
    } finally {
      database.close()
    }
  })

  return command
}
