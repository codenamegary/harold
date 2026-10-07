import { ReadLiveDaemonState } from "./daemon.state.read.live.usecase"
import { RequestStop } from "./daemon.state.ports"

const defaultHeartbeatGraceMs = 5_000
const defaultPollIntervalMs = 100
const defaultTimeoutMs = 10_000

export type StopLiveDaemonError =
  | { readonly kind: "not_running" }
  | { readonly kind: "stale_heartbeat"; readonly pid: number; readonly ageMs: number }
  | { readonly kind: "timeout"; readonly pid: number }

export type StopLiveDaemonResult =
  | { readonly ok: true; readonly value: { readonly pid: number } }
  | { readonly ok: false; readonly error: StopLiveDaemonError }

export type StopLiveDaemon = () => Promise<StopLiveDaemonResult>

export type StopLiveDaemonDeps = Readonly<{
  readLiveDaemonState: ReadLiveDaemonState
  requestStop: RequestStop
  now: () => number
  sleep: (ms: number) => Promise<void>
  heartbeatGraceMs?: number
  pollIntervalMs?: number
  timeoutMs?: number
}>

/**
 * Stops the daemon through the state file the daemon is the single writer of
 * (ADR-0006). The heartbeat must be fresh before the pid is signaled: a live
 * pid with a stale heartbeat is a recycled pid more often than a hung daemon.
 */
export const makeStopLiveDaemon =
  (deps: StopLiveDaemonDeps): StopLiveDaemon =>
  async (): Promise<StopLiveDaemonResult> => {
    const heartbeatGraceMs = deps.heartbeatGraceMs ?? defaultHeartbeatGraceMs
    const pollIntervalMs = deps.pollIntervalMs ?? defaultPollIntervalMs
    const timeoutMs = deps.timeoutMs ?? defaultTimeoutMs

    const live = deps.readLiveDaemonState()
    if (!live.ok) {
      return { ok: false, error: { kind: "not_running" } }
    }

    const ageMs = deps.now() - Date.parse(live.state.writtenAt)
    if (!Number.isFinite(ageMs) || ageMs > heartbeatGraceMs) {
      return { ok: false, error: { kind: "stale_heartbeat", pid: live.state.pid, ageMs } }
    }

    const { pid } = live.state
    deps.requestStop(pid)
    const deadline = deps.now() + timeoutMs

    for (;;) {
      const current = deps.readLiveDaemonState()
      if (!current.ok) {
        return { ok: true, value: { pid } }
      }

      if (deps.now() >= deadline) {
        return { ok: false, error: { kind: "timeout", pid } }
      }

      await deps.sleep(pollIntervalMs)
    }
  }
