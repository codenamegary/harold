import { LogLevel } from "contracts/http/runtime-settings"
import { ListLogsQuery, LogRecord } from "contracts/http/logs"

export const DEFAULT_LOG_BUFFER_CAPACITY = 1000

const logLevelRank: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

export type LogRecordInput = Omit<LogRecord, "id">

export type LogBuffer = {
  append: (input: LogRecordInput) => LogRecord
  list: (query: ListLogsQuery) => {
    items: LogRecord[]
    count: number
    limit: number
  }
  clear: () => void
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

export const createLogBuffer = (capacity = DEFAULT_LOG_BUFFER_CAPACITY): LogBuffer => {
  const state: { nextId: number; records: readonly LogRecord[] } = {
    nextId: 1,
    records: [],
  }

  const append = (input: LogRecordInput): LogRecord => {
    const record: LogRecord = {
      ...input,
      id: String(state.nextId),
    }
    state.nextId += 1
    state.records = [...state.records, record].slice(-capacity)
    return record
  }

  const list = (query: ListLogsQuery) => {
    const matched = state.records.filter((record) => matchesQuery(record, query))
    return {
      items: matched.slice(-query.limit).toReversed(),
      count: matched.length,
      limit: query.limit,
    }
  }

  const clear = () => {
    state.records = []
  }

  return { append, list, clear }
}
