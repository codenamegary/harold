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

  test("confirm while needs_auth reopens host-login with retry copy", async () => {
    const broker = createAuthBroker({
      agentExists: () => true,
      requestRespawn: async () => undefined,
      resolveAdapter: () =>
        createTestAdapter({
          probe: async () => ({
            status: "needs_auth",
            error: null,
            canLogout: false,
          }),
        }),
    })

    const started = await broker.startSession({ agentId: "cursor" })
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
      throw new Error("expected confirm to keep session")
    }
    expect(confirmed.value.status).toBe("in_progress")
    expect(confirmed.value.sessionId).toBe(started.value.sessionId)
    expect(
      confirmed.value.steps.some(
        (step) =>
          step.type === "show_message" &&
          step.body.startsWith("That didn't work."),
      ),
    ).toBe(true)

    const auth = await broker.get("cursor")
    expect(auth.session?.status).toBe("in_progress")
    expect(auth.status).toBe("needs_auth")
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

  test("ensureReadyForPrompt blocks needs_auth and allows unknown and authenticated", async () => {
    let probeStatus: "needs_auth" | "unknown" | "authenticated" = "needs_auth"
    const broker = createAuthBroker({
      agentExists: () => true,
      requestRespawn: async () => undefined,
      resolveAdapter: () =>
        createTestAdapter({
          probe: async () => ({
            status: probeStatus,
            error: null,
            canLogout: probeStatus === "authenticated",
          }),
        }),
    })

    await broker.observeInitialize({ agentId: "cursor", initializeResult: {} })

    const blocked = await broker.ensureReadyForPrompt("cursor")
    expect(blocked.ok).toBe(false)
    if (blocked.ok) {
      throw new Error("expected block")
    }
    expect(blocked.status).toBe("needs_auth")
    expect(blocked.session?.status).toBe("in_progress")

    probeStatus = "unknown"
    await broker.observeInitialize({ agentId: "cursor", initializeResult: {} })
    const allowedUnknown = await broker.ensureReadyForPrompt("cursor")
    expect(allowedUnknown.ok).toBe(true)

    probeStatus = "authenticated"
    await broker.observeInitialize({ agentId: "cursor", initializeResult: {} })
    const allowedAuth = await broker.ensureReadyForPrompt("cursor")
    expect(allowedAuth.ok).toBe(true)
  })

  test("ensureSessionFromChallenge attaches in-flight session and retries after success", async () => {
    const broker = createAuthBroker({
      agentExists: () => true,
      requestRespawn: async () => undefined,
    })

    const first = await broker.ensureSessionFromChallenge("cursor")
    expect(first.status).toBe("in_progress")
    expect(first.steps[0]).toMatchObject({ type: "show_message", level: "info" })

    const attached = await broker.ensureSessionFromChallenge("cursor")
    expect(attached.sessionId).toBe(first.sessionId)

    await broker.applyAction({
      agentId: "cursor",
      sessionId: first.sessionId,
      action: { type: "confirm", stepId: HOST_LOGIN_CONFIRM_STEP_ID },
    })

    const retry = await broker.ensureSessionFromChallenge("cursor")
    expect(retry.sessionId).not.toBe(first.sessionId)
    expect(retry.steps[0]).toMatchObject({ type: "show_message", level: "error" })
    expect(
      retry.steps[0] !== undefined
        && retry.steps[0].type === "show_message"
        && retry.steps[0].body.startsWith("That didn't work."),
    ).toBe(true)
  })

  test("subscribe receives auth snapshots when session starts", async () => {
    const broker = createAuthBroker({
      agentExists: () => true,
      requestRespawn: async () => undefined,
    })

    const events: Array<{ agentId: string; status: string }> = []
    const unsubscribe = broker.subscribe(({ agentId, auth }) => {
      events.push({ agentId, status: auth.status })
    })

    await broker.startSession({ agentId: "cursor" })
    expect(events.length).toBeGreaterThan(0)
    expect(events[0]).toEqual({ agentId: "cursor", status: "unknown" })
    unsubscribe()
  })

  test("probeEnabledAgents updates summaries for listed agents", async () => {
    let probeCount = 0
    const broker = createAuthBroker({
      agentExists: (agentId) => agentId === "cursor",
      requestRespawn: async () => undefined,
      listProbeTtlMs: 60_000,
      now: () => 1_000,
      resolveAdapter: () =>
        createTestAdapter({
          probe: async () => {
            probeCount += 1
            return {
              status: "authenticated",
              error: null,
              canLogout: true,
            }
          },
        }),
    })

    await broker.probeEnabledAgents(["cursor"])
    const summary = await broker.getSummary("cursor")
    expect(summary.status).toBe("authenticated")
    expect(summary.canLogout).toBe(true)
    expect(probeCount).toBe(1)

    await broker.probeEnabledAgents(["cursor"])
    expect(probeCount).toBe(1)
  })

  test("probeEnabledAgents re-probes after TTL expires", async () => {
    let probeCount = 0
    let clock = 0
    const broker = createAuthBroker({
      agentExists: () => true,
      requestRespawn: async () => undefined,
      listProbeTtlMs: 100,
      now: () => clock,
      resolveAdapter: () =>
        createTestAdapter({
          probe: async () => {
            probeCount += 1
            return {
              status: "needs_auth",
              error: null,
              canLogout: false,
            }
          },
        }),
    })

    await broker.probeEnabledAgents(["cursor"])
    clock = 200
    await broker.probeEnabledAgents(["cursor"])
    expect(probeCount).toBe(2)
  })
})
