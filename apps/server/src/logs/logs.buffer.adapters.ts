import { LogRecord } from "contracts/http/logs"
import { AppendLog, ClearLogs, GetLogRecords } from "./logs.ports"

export const DEFAULT_LOG_BUFFER_CAPACITY = 1000

export type LogBufferStore = Readonly<{
  appendLog: AppendLog
  getLogRecords: GetLogRecords
  clearLogs: ClearLogs
}>

export const makeInMemoryLogStore = (capacity = DEFAULT_LOG_BUFFER_CAPACITY): LogBufferStore => {
  const state: { nextId: number; records: readonly LogRecord[] } = {
    nextId: 1,
    records: [],
  }

  const appendLog: AppendLog = (input) => {
    const record: LogRecord = {
      ...input,
      id: String(state.nextId),
    }
    state.nextId += 1
    state.records = [...state.records, record].slice(-capacity)
    return record
  }

  const getLogRecords: GetLogRecords = () => state.records

  const clearLogs: ClearLogs = () => {
    state.records = []
  }

  return { appendLog, getLogRecords, clearLogs }
}
