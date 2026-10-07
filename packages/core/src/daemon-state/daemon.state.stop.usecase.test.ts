import { describe, expect, test } from "bun:test"
import { DaemonState, DaemonStateSchema } from "./daemon.state.models"
import { makeReadLiveDaemonState } from "./daemon.state.read.live.usecase"
import { StopLiveDaemonDeps, makeStopLiveDaemon } from "./daemon.state.stop.usecase"

const writtenAt = "2026-01-01T00:00:00.000Z"

const state = (pid: number): DaemonState =>
  DaemonStateSchema.parse({
    pid,
    writtenAt,
    status: {
      version: "1.0.0",
      state: "online",
      bindAddress: "127.0.0.1",
      port: 3847,
      startedAt: writtenAt,
      acp: { state: "ready", activeSessions: 0 },
    },
  })

type Harness = Readonly<{
  deps: StopLiveDaemonDeps
  stopRequests: number[]
  clockMs: () => number
}>

const makeHarness = (options: {
  pid: number
  alive: () => boolean
  now: () => number
}): Harness => {
  const stopRequests: number[] = []

  const readLiveDaemonState = makeReadLiveDaemonState({
    readDaemonState: () => ({ ok: true, state: state(options.pid) }),
    isProcessAlive: () => options.alive(),
  })

  return {
    deps: {
      readLiveDaemonState,
      requestStop: (pid) => {
        stopRequests.push(pid)
        return true
      },
      now: options.now,
      sleep: async () => undefined,
    },
    stopRequests,
    clockMs: options.now,
  }
}

describe("makeStopLiveDaemon", () => {
  test("signals the live daemon and resolves once it exits", async () => {
    const startMs = Date.parse(writtenAt) + 1_000
    let alive = true
    const harness = makeHarness({
      pid: 4321,
      alive: () => alive,
      now: () => startMs,
    })
    const stop = makeStopLiveDaemon({
      ...harness.deps,
      sleep: async () => {
        alive = false
      },
    })

    const result = await stop()

    expect(result).toEqual({ ok: true, value: { pid: 4321 } })
    expect(harness.stopRequests).toEqual([4321])
  })

  test("refuses to signal when no daemon is live", async () => {
    const harness = makeHarness({
      pid: 4321,
      alive: () => false,
      now: () => Date.parse(writtenAt),
    })
    const stop = makeStopLiveDaemon(harness.deps)

    const result = await stop()

    expect(result).toEqual({ ok: false, error: { kind: "not_running" } })
    expect(harness.stopRequests).toEqual([])
  })

  test("refuses a live pid whose heartbeat is stale", async () => {
    const staleAgeMs = 6_000
    const harness = makeHarness({
      pid: 4321,
      alive: () => true,
      now: () => Date.parse(writtenAt) + staleAgeMs,
    })
    const stop = makeStopLiveDaemon(harness.deps)

    const result = await stop()

    expect(result).toEqual({
      ok: false,
      error: { kind: "stale_heartbeat", pid: 4321, ageMs: staleAgeMs },
    })
    expect(harness.stopRequests).toEqual([])
  })

  test("reports a timeout when the process outlives the deadline", async () => {
    const startMs = Date.parse(writtenAt)
    let clock = startMs
    const harness = makeHarness({
      pid: 4321,
      alive: () => true,
      now: () => clock,
    })
    const stop = makeStopLiveDaemon({
      ...harness.deps,
      timeoutMs: 200,
      pollIntervalMs: 100,
      sleep: async (ms) => {
        clock += ms
      },
    })

    const result = await stop()

    expect(result).toEqual({ ok: false, error: { kind: "timeout", pid: 4321 } })
    expect(harness.stopRequests).toEqual([4321])
  })
})
