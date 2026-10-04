import { describe, expect, test } from "bun:test"
import { HaroldState } from "contracts/http/status"
import { GetStatusDeps, makeGetStatus } from "./status.get.usecase"

const makeDeps = (overrides: Partial<GetStatusDeps> = {}): GetStatusDeps => ({
  getVersion: () => "0.2.1",
  getServerState: () => "online",
  getStartedAt: () => "2026-01-01T00:00:00.000Z",
  getBindPort: () => 3847,
  getAcpStatus: () => ({ state: "ready", activeSessions: 2 }),
  ...overrides,
})

describe("makeGetStatus", () => {
  test("projects the status view from its ports", () => {
    const getStatus = makeGetStatus(makeDeps())

    expect(getStatus()).toEqual({
      version: "0.2.1",
      state: "online",
      bindAddress: "127.0.0.1",
      port: 3847,
      startedAt: "2026-01-01T00:00:00.000Z",
      acp: { state: "ready", activeSessions: 2 },
    })
  })

  test("reads live runtime and ACP state on every call", () => {
    let state: HaroldState = "starting"
    let activeSessions = 0
    const getStatus = makeGetStatus(
      makeDeps({
        getServerState: () => state,
        getAcpStatus: () => ({ state: "starting", activeSessions }),
      }),
    )

    expect(getStatus()).toEqual({
      version: "0.2.1",
      state: "starting",
      bindAddress: "127.0.0.1",
      port: 3847,
      startedAt: "2026-01-01T00:00:00.000Z",
      acp: { state: "starting", activeSessions: 0 },
    })

    state = "online"
    activeSessions = 3

    expect(getStatus()).toEqual({
      version: "0.2.1",
      state: "online",
      bindAddress: "127.0.0.1",
      port: 3847,
      startedAt: "2026-01-01T00:00:00.000Z",
      acp: { state: "starting", activeSessions: 3 },
    })
  })

  test("rejects a projection that violates the status contract", () => {
    const getStatus = makeGetStatus(makeDeps({ getBindPort: () => 0 }))

    expect(() => getStatus()).toThrow()
  })
})
