import { Buffer } from "node:buffer"
import { closeSync, existsSync, fstatSync, openSync, readSync, statSync } from "node:fs"
import path from "node:path"
import { LogTailReadError } from "./logs.tail.models"
import { FollowLogAppends, ReadLogTailLines } from "./logs.tail.ports"

const isNotFoundFilesystemError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"

export const daemonLogFileName = "harold.log"

export const daemonLogFilePath = (dataDir: string): string => path.join(dataDir, daemonLogFileName)

/**
 * The daemon's log destination: the operator's persisted `logPath` when set,
 * otherwise the default file under the data dir. The CLI resolves the same
 * way so `harold logs` tails what `harold serve` writes.
 */
export const resolveDaemonLogPath = (persistedLogPath: string | null, dataDir: string): string =>
  persistedLogPath ?? daemonLogFilePath(dataDir)

const readChunkBackwards = (
  fd: number,
  position: number,
  length: number,
): { buffer: Buffer; nextPosition: number } => {
  const buffer = Buffer.alloc(length)
  readSync(fd, buffer, 0, length, position)
  return { buffer, nextPosition: position - length }
}

/**
 * Reads the last `lineCount` lines without loading the head of the file:
 * walk backwards in chunks until enough newlines are seen, then split only
 * the collected tail.
 */
const readLastLines = (filePath: string, lineCount: number): string[] => {
  const fd = openSync(filePath, "r")
  try {
    const size = fstatSync(fd).size
    if (size === 0) {
      return []
    }

    const chunkSize = 8_192
    const chunks: Buffer[] = []
    let position = size
    let newlines = 0

    while (position > 0 && newlines < lineCount) {
      const length = Math.min(chunkSize, position)
      const read = readChunkBackwards(fd, position - length, length)
      chunks.unshift(read.buffer)
      position = read.nextPosition
      for (const byte of read.buffer) {
        if (byte === 0x0a) {
          newlines += 1
        }
      }
    }

    const pieces = Buffer.concat(chunks).toString("utf8").split("\n")
    if (pieces[pieces.length - 1] === "") {
      pieces.pop()
    }
    return pieces.slice(-lineCount)
  } finally {
    closeSync(fd)
  }
}

const sizeOf = (filePath: string): number | undefined => {
  try {
    return statSync(filePath).size
  } catch {
    return undefined
  }
}

const readFrom = (filePath: string, offset: number, length: number): Buffer | undefined => {
  let fd: number
  try {
    fd = openSync(filePath, "r")
  } catch {
    return undefined
  }
  try {
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, offset)
    return buffer
  } finally {
    closeSync(fd)
  }
}

export type NodeLogTailReader = Readonly<{
  readTailLines: ReadLogTailLines
  followAppends: FollowLogAppends
}>

const defaultPollIntervalMs = 250

/**
 * Filesystem reader for the daemon log. Follow mode polls the file size so
 * it works everywhere the daemon writes, tolerates a file that appears
 * later, and resets after truncation. The poll timer keeps the process
 * alive on purpose: following is a streaming CLI mode.
 */
export const makeNodeLogTailReader = (
  params: Readonly<{ pollIntervalMs?: number }> = {},
): NodeLogTailReader => {
  const pollIntervalMs = params.pollIntervalMs ?? defaultPollIntervalMs

  const readTailLines: ReadLogTailLines = ({ path: filePath, lines }) => {
    if (!existsSync(filePath)) {
      return { ok: false, error: { kind: "log_file_missing" } }
    }

    try {
      return { ok: true, lines: readLastLines(filePath, lines) }
    } catch (error: unknown) {
      const readError: LogTailReadError = isNotFoundFilesystemError(error)
        ? { kind: "log_file_missing" }
        : { kind: "log_file_read_failed", detail: String(error) }
      return { ok: false, error: readError }
    }
  }

  const followAppends: FollowLogAppends = ({ path: filePath, onLines }) => {
    const state = { offset: sizeOf(filePath) ?? 0, leftover: "" }

    const poll = () => {
      const size = sizeOf(filePath)
      if (size === undefined || size === state.offset) {
        return
      }
      if (size < state.offset) {
        state.offset = 0
        state.leftover = ""
      }

      const chunk = readFrom(filePath, state.offset, size - state.offset)
      if (chunk === undefined) {
        return
      }
      state.offset = size

      const pieces = (state.leftover + chunk.toString("utf8")).split("\n")
      state.leftover = pieces.pop() ?? ""
      if (pieces.length > 0) {
        onLines(pieces)
      }
    }

    const timer = setInterval(poll, pollIntervalMs)
    return (): void => {
      clearInterval(timer)
    }
  }

  return { readTailLines, followAppends }
}
