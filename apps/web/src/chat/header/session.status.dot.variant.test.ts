import { describe, expect, test } from "bun:test"
import { sessionStatusDotVariant } from "./session.status.dot.variant"

describe("session status dot", () => {
  test("maps idle running offline and error", () => {
    expect(sessionStatusDotVariant("idle")).toBe("online")
    expect(sessionStatusDotVariant("running")).toBe("warning")
    expect(sessionStatusDotVariant("awaiting-permission")).toBe("warning")
    expect(sessionStatusDotVariant("offline")).toBe("offline")
    expect(sessionStatusDotVariant("error")).toBe("offline")
    expect(sessionStatusDotVariant("starting")).toBeNull()
  })
})
