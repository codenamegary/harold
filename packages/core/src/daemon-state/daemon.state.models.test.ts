import { describe, expect, test } from "bun:test"
import { DaemonStateSchema } from "./daemon.state.models"

const makeEnvelope = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  pid: 1234,
  writtenAt: "2026-01-01T00:00:00.000Z",
  status: {
    version: "0.2.1",
    state: "online",
    bindAddress: "127.0.0.1",
    port: 3847,
    startedAt: "2026-01-01T00:00:00.000Z",
    acp: { state: "ready", activeSessions: 2 },
  },
  ...overrides,
})

describe("DaemonStateSchema", () => {
  test("parses an envelope written by the daemon", () => {
    const parsed = DaemonStateSchema.parse(makeEnvelope())

    expect(parsed.pid).toBe(1234)
    expect(parsed.writtenAt).toBe("2026-01-01T00:00:00.000Z")
    expect(parsed.status.acp).toEqual({ state: "ready", activeSessions: 2 })
  })

  test("rejects an envelope without a pid", () => {
    const { pid: _pid, ...envelope } = makeEnvelope()

    expect(() => DaemonStateSchema.parse(envelope)).toThrow()
  })

  test("rejects an envelope whose status violates the status contract", () => {
    const envelope = makeEnvelope({ status: { state: "bogus" } })

    expect(() => DaemonStateSchema.parse(envelope)).toThrow()
  })
})
