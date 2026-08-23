import { describe, expect, test } from "bun:test"
import { createDefaultAuthAdapter } from "./default.adapter"

describe("createDefaultAuthAdapter", () => {
  test("returns generic host-login instructions naming the host machine", async () => {
    const adapter = createDefaultAuthAdapter()
    const instructions = adapter.hostLoginInstructions({
      agentId: "cursor",
      hostIdentity: { id: "default" },
      hostMachineName: "dev-box",
      initializeResult: null,
    })

    expect(instructions).toContain("dev-box")
    expect(instructions).toContain("I have logged in")
  })

  test("start builds show_message and confirm steps", async () => {
    const adapter = createDefaultAuthAdapter()
    const started = await adapter.start(
      {
        agentId: "cursor",
        hostIdentity: { id: "default" },
        hostMachineName: "dev-box",
        initializeResult: null,
      },
      { sessionId: "sess-1", retry: false },
    )

    expect(started.steps.map((step) => step.type)).toEqual(["show_message", "confirm"])
  })

  test("probe returns unknown", async () => {
    const adapter = createDefaultAuthAdapter()
    const probe = await adapter.probe({
      agentId: "cursor",
      hostIdentity: { id: "default" },
      hostMachineName: "dev-box",
      initializeResult: null,
    })

    expect(probe).toEqual({
      status: "unknown",
      error: null,
      canLogout: false,
    })
  })
})
