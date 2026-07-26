import { describe, expect, test } from "bun:test"
import { createSessionId } from "./create-session-id"

describe("createSessionId", () => {
  test("returns sess_ prefixed ulid ids", () => {
    expect(createSessionId()).toMatch(/^sess_[0-9A-HJKMNP-TV-Z]{26}$/)
  })
})
