import { describe, expect, test } from "bun:test"
import { AcpSession } from "contracts/http/session"
import {
  filterSessionsByTitle,
  recentSessions,
  sortSessionsByUpdatedAtDesc,
} from "./session.list.helpers"

const session = (
  title: string,
  updatedAt: string,
  sessionId: string = title,
): AcpSession => ({
  agentId: "cursor",
  sessionId,
  cwd: "/tmp",
  title,
  updatedAt,
})

describe("session.list.helpers", () => {
  test("recentSessions takes five newest by updatedAt", () => {
    const items = [
      session("A", "2026-08-01T00:00:00.000Z"),
      session("B", "2026-08-05T00:00:00.000Z"),
      session("C", "2026-08-03T00:00:00.000Z"),
      session("D", "2026-08-04T00:00:00.000Z"),
      session("E", "2026-08-02T00:00:00.000Z"),
      session("F", "2026-08-06T00:00:00.000Z"),
    ]

    expect(recentSessions(items).map((row) => row.title)).toEqual([
      "F",
      "B",
      "D",
      "C",
      "E",
    ])
  })

  test("filterSessionsByTitle is case-insensitive contains", () => {
    const items = [
      session("Auth flow", "2026-08-02T00:00:00.000Z"),
      session("Billing", "2026-08-03T00:00:00.000Z"),
    ]

    expect(
      filterSessionsByTitle(items, "auth").map((row) => row.title),
    ).toEqual(["Auth flow"])
    expect(sortSessionsByUpdatedAtDesc(items)[0]?.title).toBe("Billing")
  })
})
