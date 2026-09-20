import { LogRecord } from "contracts/http/logs"

export type LogRecordInput = Omit<LogRecord, "id">

export type LogPage = Readonly<{
  items: LogRecord[]
  count: number
  limit: number
}>

export type QueryLogsError = { readonly kind: "INVALID_LIMIT"; readonly limit: number }

export type QueryLogsResult =
  | { readonly ok: true; readonly value: LogPage }
  | { readonly ok: false; readonly error: QueryLogsError }
