import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import path from "node:path"
import { DaemonState, DaemonStateSchema, ReadDaemonStateResult } from "./daemon.state.models"
import {
  IsProcessAlive,
  ReadDaemonState,
  RequestStop,
  WriteDaemonState,
} from "./daemon.state.ports"

const isNotFoundFilesystemError = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"

export const daemonStateFileName = "daemon-state.json"

export const daemonStateFilePath = (dataDir: string): string =>
  path.join(dataDir, daemonStateFileName)

export type DaemonStateFileStore = Readonly<{
  read: ReadDaemonState
  write: WriteDaemonState
}>

export const makeDaemonStateFileStore = (params: { path: string }): DaemonStateFileStore => {
  const write: WriteDaemonState = (state: DaemonState) => {
    mkdirSync(path.dirname(params.path), { recursive: true })
    const tempPath = `${params.path}.tmp`
    writeFileSync(tempPath, JSON.stringify(state))
    renameSync(tempPath, params.path)
  }

  const read: ReadDaemonState = (): ReadDaemonStateResult => {
    let raw: string
    try {
      raw = readFileSync(params.path, "utf8")
    } catch (error: unknown) {
      if (isNotFoundFilesystemError(error)) {
        return { ok: false, error: { kind: "not_found" } }
      }
      return { ok: false, error: { kind: "invalid", detail: String(error) } }
    }

    try {
      return { ok: true, state: DaemonStateSchema.parse(JSON.parse(raw)) }
    } catch (error: unknown) {
      return { ok: false, error: { kind: "invalid", detail: String(error) } }
    }
  }

  return { read, write }
}

/**
 * Liveness via signal 0: the probe succeeds for any process the caller may
 * signal, which on the same host and user means the daemon pid is alive.
 */
export const makeNodeProcessAlive = (): IsProcessAlive => {
  return (pid: number) => {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }
}

/**
 * Asks the daemon to shut down. A false result means the process was already
 * gone (ESRCH) or the caller may not signal it.
 */
export const makeNodeRequestStop = (): RequestStop => {
  return (pid: number) => {
    try {
      process.kill(pid, "SIGTERM")
      return true
    } catch {
      return false
    }
  }
}
