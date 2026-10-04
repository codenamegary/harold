import { LogLevel } from "contracts/http/runtime-settings"
import { parsePinoLine } from "./logs.pino.line"
import { LogTailEntry, ReadLogTailResult } from "./logs.tail.models"
import { FollowLogAppends, ReadLogTailLines, StopFollowingLogLines } from "./logs.tail.ports"

const logLevelRank: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
}

export const toLogTailEntry = (raw: string): LogTailEntry => ({
  raw,
  record: parsePinoLine(raw) ?? {
    ts: new Date().toISOString(),
    level: "info",
    source: "server",
    message: raw,
  },
})

/**
 * Parses raw log lines into entries and keeps only those at or above the
 * optional minimum level. Blank lines are dropped.
 */
export const selectLogEntries = (lines: readonly string[], level?: LogLevel): LogTailEntry[] =>
  lines
    .filter((line) => line.trim().length > 0)
    .map(toLogTailEntry)
    .filter(
      (entry) => level === undefined || logLevelRank[entry.record.level] >= logLevelRank[level],
    )

export type TailLogsDeps = Readonly<{
  readTailLines: ReadLogTailLines
}>

export type TailLogs = (
  params: Readonly<{
    path: string
    lines: number
    level?: LogLevel
  }>,
) => ReadLogTailResult

/**
 * Reads the last `lines` entries of the daemon log file, oldest first,
 * filtered to the optional minimum level.
 */
export const makeTailLogs =
  (deps: TailLogsDeps): TailLogs =>
  (params) => {
    if (!Number.isInteger(params.lines) || params.lines <= 0) {
      return { ok: false, error: { kind: "invalid_lines", lines: params.lines } }
    }

    const read = deps.readTailLines({ path: params.path, lines: params.lines })
    if (!read.ok) {
      return read
    }

    return { ok: true, entries: selectLogEntries(read.lines, params.level) }
  }

export type FollowLogsDeps = Readonly<{
  followAppends: FollowLogAppends
}>

export type FollowLogs = (
  params: Readonly<{
    path: string
    level?: LogLevel
    onEntries: (entries: readonly LogTailEntry[]) => void
  }>,
) => StopFollowingLogLines

/**
 * Streams future log entries through the same parsing and level filter as
 * `makeTailLogs`, so a follow starts where the initial tail ended.
 */
export const makeFollowLogs =
  (deps: FollowLogsDeps): FollowLogs =>
  (params) =>
    deps.followAppends({
      path: params.path,
      onLines: (lines) => {
        const entries = selectLogEntries(lines, params.level)
        if (entries.length > 0) {
          params.onEntries(entries)
        }
      },
    })
