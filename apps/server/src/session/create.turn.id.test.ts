import { describe, expect, test } from "bun:test"
import { createTurnId } from "./create.turn.id"

describe("createTurnId", () => {
  test("returns turn_ prefixed ULIDs", () => {
    const turnId = createTurnId()
    expect(turnId.startsWith("turn_")).toBe(true)
    expect(turnId).toMatch(/^turn_[0-9A-HJKMNP-TV-Z]{26}$/)
  })
})
