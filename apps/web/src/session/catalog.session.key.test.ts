import { describe, expect, test } from "bun:test"
import { catalogSessionKey, parseCatalogSessionKey } from "./catalog.session.key"

describe("catalog session key", () => {
  test("round-trips agentId and sessionId", () => {
    const key = catalogSessionKey({ agentId: "cursor", sessionId: "acp-1" })
    expect(key).toBe("cursor:acp-1")
    expect(parseCatalogSessionKey(key)).toEqual({
      agentId: "cursor",
      sessionId: "acp-1",
    })
  })

  test("keeps colons inside the ACP session id", () => {
    expect(parseCatalogSessionKey("opencode:abc:def")).toEqual({
      agentId: "opencode",
      sessionId: "abc:def",
    })
  })
})
