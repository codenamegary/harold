import { describe, expect, test } from "bun:test"
import { createSessionInfoCache } from "./session.info.cache"

describe("session info cache", () => {
  test("remembers, replaces, and forgets titles per session", () => {
    const cache = createSessionInfoCache()

    cache.remember({ agentId: "cursor", sessionId: "s1", title: "First" })
    expect(cache.get({ agentId: "cursor", sessionId: "s1" })).toBe("First")
    expect(cache.get({ agentId: "cursor", sessionId: "s2" })).toBeUndefined()
    expect(cache.get({ agentId: "opencode", sessionId: "s1" })).toBeUndefined()

    cache.remember({ agentId: "cursor", sessionId: "s1", title: "Second" })
    expect(cache.get({ agentId: "cursor", sessionId: "s1" })).toBe("Second")

    cache.forget({ agentId: "cursor", sessionId: "s1" })
    expect(cache.get({ agentId: "cursor", sessionId: "s1" })).toBeUndefined()
  })
})
