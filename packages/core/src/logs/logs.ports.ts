import { ListLogsQuery, LogRecord } from "contracts/http/logs"
import { LogRecordInput, QueryLogsResult } from "./logs.models"

export type AppendLog = (input: LogRecordInput) => LogRecord

export type GetLogRecords = () => readonly LogRecord[]

export type QueryLogs = (query: ListLogsQuery) => QueryLogsResult

export type ClearLogs = () => void
