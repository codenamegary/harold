import { describe, expect, test } from "bun:test"
import { createSessionOwnership } from "./session.ownership"

describe("session ownership", () => {
  test("remembers and resolves the owning agent", () => {
    const ownership = createSessionOwnership()

    ownership.remember({ agentId: "cursor", acpSessionId: "sess-1" })

    expect(ownership.ownerOf("sess-1")).toBe("cursor")
    expect(ownership.ownerOf("sess-2")).toBeUndefined()
  })

  test("forgets a session", () => {
    const ownership = createSessionOwnership()

    ownership.remember({ agentId: "cursor", acpSessionId: "sess-1" })
    ownership.forget({ acpSessionId: "sess-1" })

    expect(ownership.ownerOf("sess-1")).toBeUndefined()
  })

  test("lists sessions owned by one agent", () => {
    const ownership = createSessionOwnership()

    ownership.remember({ agentId: "cursor", acpSessionId: "sess-1" })
    ownership.remember({ agentId: "opencode", acpSessionId: "sess-2" })
    ownership.remember({ agentId: "cursor", acpSessionId: "sess-3" })

    expect(ownership.sessionsOwnedBy("cursor")).toEqual(["sess-1", "sess-3"])
    expect(ownership.sessionsOwnedBy("opencode")).toEqual(["sess-2"])
    expect(ownership.sessionsOwnedBy("gemini")).toEqual([])
  })

  test("reassigning ownership updates the owner", () => {
    const ownership = createSessionOwnership()

    ownership.remember({ agentId: "cursor", acpSessionId: "sess-1" })
    ownership.remember({ agentId: "opencode", acpSessionId: "sess-1" })

    expect(ownership.ownerOf("sess-1")).toBe("opencode")
    expect(ownership.sessionsOwnedBy("cursor")).toEqual([])
    expect(ownership.sessionsOwnedBy("opencode")).toEqual(["sess-1"])
  })
})
