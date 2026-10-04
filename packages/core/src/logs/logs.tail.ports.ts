import { LogTailReadError } from "./logs.tail.models"

export type ReadLogTailLinesResult =
  | { readonly ok: true; readonly lines: readonly string[] }
  | { readonly ok: false; readonly error: LogTailReadError }

export type ReadLogTailLines = (
  params: Readonly<{
    path: string
    lines: number
  }>,
) => ReadLogTailLinesResult

export type OnLogLines = (lines: readonly string[]) => void

export type StopFollowingLogLines = () => void

/**
 * Follows appends to a log file. Starts at the current end of the file, or
 * from byte 0 when the file does not exist yet, and only emits complete
 * lines. Returns the stop handle that ends the follow.
 */
export type FollowLogAppends = (
  params: Readonly<{
    path: string
    onLines: OnLogLines
  }>,
) => StopFollowingLogLines
