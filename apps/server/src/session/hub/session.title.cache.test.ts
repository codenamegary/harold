import { describe, expect, test } from "bun:test"
import { createSessionTitleCache } from "./session.title.cache"

describe("session title cache", () => {
  test("remembers, replaces, and forgets titles per session", () => {
    const { getSessionTitle, rememberSessionTitle, forgetSessionTitle } = createSessionTitleCache()

    rememberSessionTitle({ agentId: "cursor", sessionId: "s1", title: "First" })
    expect(getSessionTitle({ agentId: "cursor", sessionId: "s1" })).toBe("First")
    expect(getSessionTitle({ agentId: "cursor", sessionId: "s2" })).toBeUndefined()
    expect(getSessionTitle({ agentId: "opencode", sessionId: "s1" })).toBeUndefined()

    rememberSessionTitle({ agentId: "cursor", sessionId: "s1", title: "Second" })
    expect(getSessionTitle({ agentId: "cursor", sessionId: "s1" })).toBe("Second")

    forgetSessionTitle({ agentId: "cursor", sessionId: "s1" })
    expect(getSessionTitle({ agentId: "cursor", sessionId: "s1" })).toBeUndefined()
  })
})
