import { describe, expect, test } from "bun:test"
import { createUsageCache } from "./usage.cache"

const first = {
  sessionUpdate: "usage_update" as const,
  used: 84200,
  size: 200000,
}

const second = {
  sessionUpdate: "usage_update" as const,
  used: 120000,
  size: 200000,
  cost: { amount: 0.09, currency: "USD" },
}

describe("usage cache", () => {
  test("remembers, replaces, and forgets per session", () => {
    const cache = createUsageCache()

    cache.remember({ agentId: "cursor", sessionId: "s1", update: first })
    expect(cache.get({ agentId: "cursor", sessionId: "s1" })).toEqual(first)
    expect(cache.get({ agentId: "cursor", sessionId: "s2" })).toBeUndefined()
    expect(cache.get({ agentId: "opencode", sessionId: "s1" })).toBeUndefined()

    cache.remember({ agentId: "cursor", sessionId: "s1", update: second })
    expect(cache.get({ agentId: "cursor", sessionId: "s1" })).toEqual(second)

    cache.forget({ agentId: "cursor", sessionId: "s1" })
    expect(cache.get({ agentId: "cursor", sessionId: "s1" })).toBeUndefined()
  })
})
