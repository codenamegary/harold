import { describe, expect, test } from "bun:test"
import { createCommandsCache } from "./commands.cache"

const first = {
  sessionUpdate: "available_commands_update",
  availableCommands: [{ name: "web", description: "Search" }],
}

const second = {
  sessionUpdate: "available_commands_update",
  availableCommands: [{ name: "test", description: "Run tests" }],
}

describe("commands cache", () => {
  test("remembers, replaces, and forgets per session", () => {
    const cache = createCommandsCache()

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
