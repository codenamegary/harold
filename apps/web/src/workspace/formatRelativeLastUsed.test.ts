import { describe, expect, test } from "bun:test"
import { formatRelativeLastUsed } from "./formatRelativeLastUsed"

describe("formatRelativeLastUsed", () => {
  const createdAt = "2026-07-24T12:00:00.000Z"
  const nowMs = new Date("2026-07-24T12:10:00.000Z").getTime()

  test("returns Never when lastUsedAt matches createdAt", () => {
    expect(formatRelativeLastUsed(createdAt, createdAt, nowMs)).toBe("Never")
  })

  test("returns minutes ago for recent use", () => {
    expect(formatRelativeLastUsed("2026-07-24T12:08:00.000Z", createdAt, nowMs)).toBe("2m ago")
  })

  test("returns hours ago for same-day use", () => {
    expect(formatRelativeLastUsed("2026-07-24T10:00:00.000Z", createdAt, nowMs)).toBe("2h ago")
  })

  test("returns days ago for older use", () => {
    expect(formatRelativeLastUsed("2026-07-22T12:00:00.000Z", createdAt, nowMs)).toBe("2d ago")
  })
})
