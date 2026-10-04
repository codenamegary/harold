import { LogRecordInput } from "./logs.models"

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
