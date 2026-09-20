import { describe, expect, test } from "bun:test"
import { aggregateStatus } from "./supervisor.aggregate.status"

describe("aggregateStatus", () => {
  test("reports stopped with no runtimes", () => {
    expect(aggregateStatus([], 0)).toEqual({ state: "stopped", activeSessions: 0 })
  })

  test("reports ready when any runtime is ready", () => {
    expect(aggregateStatus(["stopped", "ready"], 2)).toEqual({
      state: "ready",
      activeSessions: 2,
    })
  })

  test("reports starting when no runtime is ready but one is starting", () => {
    expect(aggregateStatus(["error", "starting"], 1)).toEqual({
      state: "starting",
      activeSessions: 1,
    })
  })

  test("reports error when only error and stopped runtimes remain", () => {
    expect(aggregateStatus(["stopped", "error"], 1)).toEqual({
      state: "error",
      activeSessions: 1,
    })
  })

  test("reports stopped when every runtime is stopped", () => {
    expect(aggregateStatus(["stopped", "stopped"], 3)).toEqual({
      state: "stopped",
      activeSessions: 3,
    })
  })
})
