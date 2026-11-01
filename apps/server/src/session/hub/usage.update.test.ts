import { describe, expect, test } from "bun:test"
import { parseUsageUpdate } from "./usage.update"

const usageUpdate = {
  sessionUpdate: "usage_update",
  used: 84200,
  size: 200000,
  cost: { amount: 0.045, currency: "USD" },
}

describe("parseUsageUpdate", () => {
  test("returns the original payload for a valid usage update", () => {
    expect(parseUsageUpdate(usageUpdate)).toEqual(usageUpdate)
  })

  test("returns null for other session updates", () => {
    expect(
      parseUsageUpdate({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "hi" },
      }),
    ).toBeNull()
  })

  test("returns null when used or size is missing", () => {
    expect(parseUsageUpdate({ sessionUpdate: "usage_update", size: 200000 })).toBeNull()
    expect(parseUsageUpdate({ sessionUpdate: "usage_update", used: 84200 })).toBeNull()
  })
})
