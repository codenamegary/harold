import { LogLevel } from "contracts/http/runtime-settings"

/** A parsed daemon log line. The daemon log is the single log surface since
 * the console retirement; the tail is read from the file, not over HTTP. */
export type LogRecordInput = {
  ts: string
  level: LogLevel
  source: "server" | "agent"
  message: string
  agentId?: string
}

/** One line of the daemon log file: the raw text beside its parsed record. */
export type LogTailEntry = Readonly<{
  raw: string
  record: LogRecordInput
}>

export type LogTailReadError =
  | { readonly kind: "log_file_missing" }
  | { readonly kind: "invalid_lines"; readonly lines: number }
  | { readonly kind: "log_file_read_failed"; readonly detail: string }

export type ReadLogTailResult =
  | { readonly ok: true; readonly entries: readonly LogTailEntry[] }
  | { readonly ok: false; readonly error: LogTailReadError }
