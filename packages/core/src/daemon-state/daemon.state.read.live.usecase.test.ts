import { describe, expect, test } from "bun:test"
import { DaemonState, DaemonStateSchema } from "./daemon.state.models"
import { ReadLiveDaemonStateDeps, makeReadLiveDaemonState } from "./daemon.state.read.live.usecase"

const state: DaemonState = DaemonStateSchema.parse({
  pid: 4321,
  writtenAt: "2026-01-01T00:00:00.000Z",
  status: {
    version: "0.2.1",
    state: "online",
    bindAddress: "127.0.0.1",
    port: 3847,
    startedAt: "2026-01-01T00:00:00.000Z",
    acp: { state: "ready", activeSessions: 1 },
  },
})

const makeDeps = (overrides: Partial<ReadLiveDaemonStateDeps> = {}): ReadLiveDaemonStateDeps => ({
  readDaemonState: () => ({ ok: true, state }),
  isProcessAlive: () => true,
  ...overrides,
})

describe("makeReadLiveDaemonState", () => {
  test("returns the daemon state when the file reads and the pid is alive", () => {
    const readLiveDaemonState = makeReadLiveDaemonState(makeDeps())

    expect(readLiveDaemonState()).toEqual({ ok: true, state })
  })

  test("reports no_state_file when the state file is missing", () => {
    const readLiveDaemonState = makeReadLiveDaemonState(
      makeDeps({ readDaemonState: () => ({ ok: false, error: { kind: "not_found" } }) }),
    )

    expect(readLiveDaemonState()).toEqual({ ok: false, error: { kind: "no_state_file" } })
  })

  test("reports unreadable_state_file when the state file is invalid", () => {
    const readLiveDaemonState = makeReadLiveDaemonState(
      makeDeps({
        readDaemonState: () => ({
          ok: false,
          error: { kind: "invalid", detail: "Unexpected token" },
        }),
      }),
    )

    expect(readLiveDaemonState()).toEqual({
      ok: false,
      error: { kind: "unreadable_state_file", detail: "Unexpected token" },
    })
  })

  test("reports process_not_alive when the writing pid is gone", () => {
    const readLiveDaemonState = makeReadLiveDaemonState(makeDeps({ isProcessAlive: () => false }))

    expect(readLiveDaemonState()).toEqual({
      ok: false,
      error: { kind: "process_not_alive", pid: 4321 },
    })
  })

  test("asks the liveness port on every call", () => {
    let alive = true
    const readLiveDaemonState = makeReadLiveDaemonState(makeDeps({ isProcessAlive: () => alive }))

    expect(readLiveDaemonState().ok).toBe(true)
    alive = false
    expect(readLiveDaemonState().ok).toBe(false)
  })
})
