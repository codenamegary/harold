import { describe, expect, test } from "bun:test"
import { elapsedSecondsFromStartedAt } from "./elapsedSecondsFromStartedAt"

describe("elapsedSecondsFromStartedAt", () => {
  test("returns whole seconds between startedAt and now", () => {
    const startedAt = "2026-01-01T00:00:00.000Z"
    const now = new Date("2026-01-01T01:01:01.000Z").getTime()

    expect(elapsedSecondsFromStartedAt(startedAt, now)).toBe(3661)
  })

  test("never returns negative elapsed time", () => {
    const startedAt = "2026-01-01T01:00:00.000Z"
    const now = new Date("2026-01-01T00:00:00.000Z").getTime()

    expect(elapsedSecondsFromStartedAt(startedAt, now)).toBe(0)
  })
})
