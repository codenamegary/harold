import { DaemonState } from "./daemon.state.models"
import { IsProcessAlive, ReadDaemonState } from "./daemon.state.ports"

export type DaemonNotRunning =
  | { readonly kind: "no_state_file" }
  | { readonly kind: "process_not_alive"; readonly pid: number }
  | { readonly kind: "unreadable_state_file"; readonly detail: string }

export type ReadLiveDaemonStateResult =
  | { readonly ok: true; readonly state: DaemonState }
  | { readonly ok: false; readonly error: DaemonNotRunning }

export type ReadLiveDaemonStateDeps = Readonly<{
  readDaemonState: ReadDaemonState
  isProcessAlive: IsProcessAlive
}>

export type ReadLiveDaemonState = () => ReadLiveDaemonStateResult

/**
 * Reads the daemon's persisted state and only accepts it as live when the
 * process that wrote it still exists. This is how the CLI observes the
 * daemon without a host HTTP route (ADR-0006).
 */
export const makeReadLiveDaemonState =
  (deps: ReadLiveDaemonStateDeps): ReadLiveDaemonState =>
  (): ReadLiveDaemonStateResult => {
    const read = deps.readDaemonState()

    if (!read.ok) {
      return read.error.kind === "not_found"
        ? { ok: false, error: { kind: "no_state_file" } }
        : {
            ok: false,
            error: { kind: "unreadable_state_file", detail: read.error.detail },
          }
    }

    if (!deps.isProcessAlive(read.state.pid)) {
      return { ok: false, error: { kind: "process_not_alive", pid: read.state.pid } }
    }

    return read
  }
