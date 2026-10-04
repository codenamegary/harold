import { describe, expect, test } from "bun:test"
import { Status } from "contracts/http/status"
import { DaemonState } from "core/daemon-state/models"
import { WriteDaemonState } from "core/daemon-state/ports"
import { DaemonStateWriterDeps, startDaemonStateWriter } from "./daemon.state.writer"

const status: Status = {
  version: "0.2.1",
  state: "online",
  bindAddress: "127.0.0.1",
  port: 3847,
  startedAt: "2026-01-01T00:00:00.000Z",
  acp: { state: "ready", activeSessions: 0 },
}

const makeDeps = (
  overrides: Partial<DaemonStateWriterDeps> & { writes?: Array<DaemonState> } = {},
): DaemonStateWriterDeps & { writes: Array<DaemonState> } => {
  const writes = overrides.writes ?? []
  const writeDaemonState: WriteDaemonState = (state) => {
    writes.push(state)
  }
  return {
    writes,
    getStatus: () => status,
    writeDaemonState,
    pid: 999,
    intervalMs: 5,
    ...overrides,
  }
}

describe("startDaemonStateWriter", () => {
  test("writes a snapshot as soon as it starts", () => {
    const deps = makeDeps()

    const writer = startDaemonStateWriter(deps)
    writer.stop()

    expect(deps.writes.length).toBe(1)
    expect(deps.writes[0]?.pid).toBe(999)
    expect(deps.writes[0]?.status).toEqual(status)
  })

  test("refreshes the snapshot on the interval", async () => {
    const deps = makeDeps()

    const writer = startDaemonStateWriter(deps)
    await Bun.sleep(30)
    writer.stop()

    expect(deps.writes.length).toBeGreaterThanOrEqual(2)
  })

  test("stop ends the refreshes", async () => {
    const deps = makeDeps()

    const writer = startDaemonStateWriter(deps)
    await Bun.sleep(20)
    writer.stop()
    const writesAtStop = deps.writes.length
    await Bun.sleep(30)

    expect(deps.writes.length).toBe(writesAtStop)
  })

  test("stamps a parseable writtenAt on every snapshot", () => {
    const deps = makeDeps()

    const writer = startDaemonStateWriter(deps)
    writer.stop()

    expect(deps.writes[0]?.writtenAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})
