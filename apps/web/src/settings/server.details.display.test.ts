import { describe, expect, test } from "bun:test"
import { serverDetailsDisplayByPhase } from "./server.details.display"

describe("serverDetailsDisplayByPhase", () => {
  test("shows live endpoint and version when online", () => {
    const display = serverDetailsDisplayByPhase({
      phase: "online",
      status: {
        version: "0.1.0",
        state: "online",
        bindAddress: "127.0.0.1",
        port: 3847,
        startedAt: "2026-01-01T00:00:00.000Z",
        acp: { state: "ready", activeSessions: 0 },
      },
    })

    expect(display.endpoint).toBe("http://127.0.0.1:3847")
    expect(display.runtimeVersion).toBe("0.1.0")
    expect(display.nodeJs).toBe("—")
  })

  test("shows em dashes when unreachable", () => {
    const display = serverDetailsDisplayByPhase({ phase: "unreachable" })

    expect(display.endpoint).toBe("—")
    expect(display.runtimeVersion).toBe("—")
    expect(display.nodeJs).toBe("—")
  })

  test("shows em dashes while loading", () => {
    const display = serverDetailsDisplayByPhase({ phase: "loading" })

    expect(display.endpoint).toBe("—")
    expect(display.runtimeVersion).toBe("—")
    expect(display.nodeJs).toBe("—")
  })
})
