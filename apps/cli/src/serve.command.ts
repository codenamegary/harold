import { existsSync } from "node:fs"
import { log } from "@clack/prompts"
import { Command } from "commander"
import pc from "picocolors"
import {
  daemonStateFilePath,
  makeDaemonStateFileStore,
  makeNodeProcessAlive,
} from "core/daemon-state/node.adapters"
import { makeReadLiveDaemonState } from "core/daemon-state/read.live.usecase"
import { runServer } from "server/bootstrap"
import { databasePath } from "server/database"
import { parseConfig } from "server/config"
import { isFreshInstall } from "./install.detect"

export const makeServeCommand = (): Command => {
  const command = new Command("serve")
  command.description("run the Harold daemon (local host server)")

  command.action(async () => {
    const config = parseConfig(process.env)
    const readLiveDaemonState = makeReadLiveDaemonState({
      readDaemonState: makeDaemonStateFileStore({
        path: daemonStateFilePath(config.dataDir),
      }).read,
      isProcessAlive: makeNodeProcessAlive(),
    })
    const running = readLiveDaemonState()

    if (running.ok) {
      log.warn(`Harold looks already running (pid ${running.state.pid}).`)
      process.exitCode = 1
      return
    }

    if (isFreshInstall({ databasePath: databasePath(config.dataDir), fileExists: existsSync })) {
      log.warn(pc.yellow(`Fresh install: no database in ${config.dataDir} yet.`))
      log.info(
        "Serving with defaults. Run `harold setup` to configure agents, workspace, and pairing.",
      )
    }

    await runServer()
  })

  return command
}
