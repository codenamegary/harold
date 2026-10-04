import { Command } from "commander"
import pc from "picocolors"
import { LogLevel } from "contracts/http/runtime-settings"
import { makeFollowLogs, makeTailLogs } from "core/logs/tail.usecase"
import { makeNodeLogTailReader, resolveDaemonLogPath } from "core/logs/tail.node.adapters"
import { parseConfig } from "server/config"
import { makeRuntimeSettingsFileStore, seedDefaultsFromConfig } from "server/runtime-settings"
import { parseLogLevel, parsePositiveInt } from "./logs.args"
import { renderLogEntries, renderLogReadError } from "./logs.render"

export type LogsOptions = Readonly<{
  lines: number
  follow: boolean
  level?: LogLevel
  json: boolean
}>

export const makeLogsCommand = (): Command => {
  const command = new Command("logs")
  command.description("tail the Harold daemon log")

  command
    .option("-n, --lines <count>", "number of lines to show", parsePositiveInt, 200)
    .option("-f, --follow", "keep following new log lines")
    .option("--level <level>", "minimum log level to show", parseLogLevel)
    .option("--json", "print each entry as JSON")

  command.action((options: LogsOptions) => {
    const config = parseConfig(process.env)
    const settingsStore = makeRuntimeSettingsFileStore({
      dataDir: config.dataDir,
      seedDefaults: seedDefaultsFromConfig(config),
    })
    const logPath = resolveDaemonLogPath(settingsStore.get().logPath, config.dataDir)
    const reader = makeNodeLogTailReader()

    const tailLogs = makeTailLogs({ readTailLines: reader.readTailLines })
    const result = tailLogs({ path: logPath, lines: options.lines, level: options.level })

    if (!result.ok) {
      const canFollowMissingFile = options.follow && result.error.kind === "log_file_missing"
      if (!canFollowMissingFile) {
        console.error(pc.red(renderLogReadError(result.error)))
        process.exitCode = 1
        return
      }
    } else if (result.entries.length > 0) {
      console.log(renderLogEntries(result.entries, options.json))
    }

    if (!options.follow) {
      return
    }

    const followLogs = makeFollowLogs({ followAppends: reader.followAppends })
    const stop = followLogs({
      path: logPath,
      level: options.level,
      onEntries: (entries) => {
        console.log(renderLogEntries(entries, options.json))
      },
    })

    const stopFollowing = () => {
      stop()
    }
    process.once("SIGINT", stopFollowing)
    process.once("SIGTERM", stopFollowing)
  })

  return command
}
