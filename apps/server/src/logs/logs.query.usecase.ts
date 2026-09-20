import { ListLogsQuery, LogRecord } from "contracts/http/logs"
import { LogLevel } from "contracts/http/runtime-settings"
import { QueryLogsResult } from "./logs.models"
import { GetLogRecords } from "./logs.ports"

const logLevelRank: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

const matchesQuery = (record: LogRecord, query: ListLogsQuery): boolean => {
  if (query.level !== undefined && logLevelRank[record.level] < logLevelRank[query.level]) {
    return false
  }
  if (query.source !== undefined && record.source !== query.source) {
    return false
  }
  if (query.agentId !== undefined && record.agentId !== query.agentId) {
    return false
  }
  return true
}

export type QueryLogsDeps = Readonly<{
  getLogRecords: GetLogRecords
}>

export const makeQueryLogs =
  (deps: QueryLogsDeps) =>
  (query: ListLogsQuery): QueryLogsResult => {
    if (!Number.isInteger(query.limit) || query.limit <= 0) {
      return { ok: false, error: { kind: "INVALID_LIMIT", limit: query.limit } }
    }

    const matched = deps.getLogRecords().filter((record) => matchesQuery(record, query))
    return {
      ok: true,
      value: {
        items: matched.slice(-query.limit).toReversed(),
        count: matched.length,
        limit: query.limit,
      },
    }
  }
