import { DaemonState } from "core/daemon-state/models"
import { WriteDaemonState } from "core/daemon-state/ports"
import { GetStatus } from "core/status/get.usecase"

export type DaemonStateWriterDeps = Readonly<{
  getStatus: GetStatus
  writeDaemonState: WriteDaemonState
  pid: number
  intervalMs?: number
}>

export type DaemonStateWriter = Readonly<{
  stop: () => void
}>

const defaultIntervalMs = 1_000

/**
 * Publishes the daemon's live status to the state file so the CLI can read
 * it without a host HTTP route (ADR-0006). Writes once at startup and then
 * on an interval, which keeps the heartbeat and `activeSessions` fresh.
 */
export const startDaemonStateWriter = (deps: DaemonStateWriterDeps): DaemonStateWriter => {
  const intervalMs = deps.intervalMs ?? defaultIntervalMs

  const writeSnapshot = () => {
    const state: DaemonState = {
      pid: deps.pid,
      writtenAt: new Date().toISOString(),
      status: deps.getStatus(),
    }
    deps.writeDaemonState(state)
  }

  writeSnapshot()
  const timer = setInterval(writeSnapshot, intervalMs)
  timer.unref?.()

  return {
    stop: () => {
      clearInterval(timer)
    },
  }
}
