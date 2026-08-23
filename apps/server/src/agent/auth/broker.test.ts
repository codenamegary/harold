import { describe, expect, test } from "bun:test"
import { AgentId } from "contracts/http/agent-settings"
import { AuthAdapter } from "./adapters/adapter"
import { createDefaultAuthAdapter, HOST_LOGIN_CONFIRM_STEP_ID } from "./adapters/default.adapter"
import { createAuthBroker } from "./broker"

const createTestAdapter = (overrides: Partial<AuthAdapter> = {}): AuthAdapter => ({
  ...createDefaultAuthAdapter(),
  ...overrides,
})

describe("createAuthBroker", () => {
  test("start confirm reconnects and finishes session", async () => {
    const respawns: AgentId[] = []
    const broker = createAuthBroker({
      agentExists: (agentId) => agentId === "cursor",
      requestRespawn: async (agentId) => {
        respawns.push(agentId)
      },
      resolveAdapter: () => createTestAdapter(),
    })

    const started = await broker.startSession({ agentId: "cursor" })
    expect(started.ok).toBe(true)
    if (!started.ok) {
      throw new Error("expected start to succeed")
    }

    const confirmed = await broker.applyAction({
      agentId: "cursor",
      sessionId: started.value.sessionId,
      action: { type: "confirm", stepId: HOST_LOGIN_CONFIRM_STEP_ID },
    })

    expect(confirmed.ok).toBe(true)
    if (!confirmed.ok) {
      throw new Error("expected confirm to succeed")
    }
    expect(confirmed.value.status).toBe("succeeded")
    expect(respawns).toEqual(["cursor"])
  })

  test("cancel ends the session", async () => {
    const broker = createAuthBroker({
      agentExists: () => true,
      requestRespawn: async () => undefined,
    })

    const started = await broker.startSession({ agentId: "cursor" })
    if (!started.ok) {
      throw new Error("expected start to succeed")
    }

    const cancelled = await broker.applyAction({
      agentId: "cursor",
      sessionId: started.value.sessionId,
      action: { type: "cancel" },
    })

    expect(cancelled.ok).toBe(true)
    if (!cancelled.ok) {
      throw new Error("expected cancel to succeed")
    }
    expect(cancelled.value.status).toBe("cancelled")
  })

  test("allows only one in-flight session per agent", async () => {
    const broker = createAuthBroker({
      agentExists: () => true,
      requestRespawn: async () => undefined,
    })

    const first = await broker.startSession({ agentId: "cursor" })
    const second = await broker.startSession({ agentId: "cursor" })
    if (!first.ok || !second.ok) {
      throw new Error("expected sessions to start")
    }
    expect(second.value.sessionId).toBe(first.value.sessionId)
  })

  test("blocks logout while session is in flight", async () => {
    const broker = createAuthBroker({
      agentExists: () => true,
      requestRespawn: async () => undefined,
    })

    const started = await broker.startSession({ agentId: "cursor" })
    if (!started.ok) {
      throw new Error("expected start to succeed")
    }

    const logout = await broker.logout("cursor")
    expect(logout.ok).toBe(false)
    if (logout.ok) {
      throw new Error("expected logout to fail")
    }
    expect(logout.error.kind).toBe("logout_blocked")
  })
})
