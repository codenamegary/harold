import { LogTailEntry, LogTailReadError } from "core/logs/tail.models"

export const renderLogEntryPlain = (entry: LogTailEntry): string => {
  const { record } = entry
  const agent = record.agentId === undefined ? "" : ` [${record.agentId}]`
  return `${record.ts} ${record.level.toUpperCase().padEnd(5)} ${record.source}${agent} ${record.message}`
}

export const renderLogEntryJson = (entry: LogTailEntry): string => JSON.stringify(entry.record)

export const renderLogEntries = (entries: readonly LogTailEntry[], json: boolean): string =>
  entries.map((entry) => (json ? renderLogEntryJson(entry) : renderLogEntryPlain(entry))).join("\n")

export const renderLogReadError = (error: LogTailReadError): string => {
  switch (error.kind) {
    case "log_file_missing":
      return "No log file yet. Start the daemon with `harold start` to begin writing logs."
    case "invalid_lines":
      return `Invalid line count: ${error.lines}.`
    case "log_file_read_failed":
      return `Could not read the log file: ${error.detail}`
  }
}
