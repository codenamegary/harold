import { describe, expect, test } from "bun:test"
import { formatLogTime } from "./format.log.time"

describe("formatLogTime", () => {
  test("shows the UTC time portion of an ISO timestamp", () => {
    expect(formatLogTime("2026-08-17T20:04:05.123Z")).toBe("20:04:05.123")
  })
})
