import { describe, expect, test } from "bun:test"
import { AgentId } from "contracts/http/agent-settings"
import { AcpStartResult } from "../acp/supervisor/models"
import { makeEnsureSessionBound, makeEnsureSupervisorReady } from "./session.acp.ready"

const createSupervisorStub = (params: {
  running: ReadonlyArray<AgentId>
  start?: (agentId: AgentId) => Promise<AcpStartResult>
}) => ({
  getRunningAgentIds: () => params.running,
  start: params.start ?? (async () => ({ ok: true as const })),
})

describe("makeEnsureSupervisorReady", () => {
  test("returns ok when the agent is already running", async () => {
    const ensureSupervisorReady = makeEnsureSupervisorReady(
      createSupervisorStub({ running: ["cursor"] }),
    )

    const result = await ensureSupervisorReady("cursor")

    expect(result).toEqual({ ok: true })
  })

  test("returns sanitized start failure reason when start reports a failure", async () => {
    const ensureSupervisorReady = makeEnsureSupervisorReady(
      createSupervisorStub({
        running: [],
        start: async () => ({
          ok: false as const,
          reason: "spawn exploded: Bearer secret-token-value",
        }),
      }),
    )

    const result = await ensureSupervisorReady("cursor")

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error("expected start failure")
    }
    expect(result.reason).toContain("spawn exploded")
    expect(result.reason).not.toContain("secret-token-value")
    expect(result.reason).toContain("[redacted]")
  })

  test("returns a clear reason when start finishes without a ready agent", async () => {
    const ensureSupervisorReady = makeEnsureSupervisorReady(
      createSupervisorStub({
        running: [],
        start: async () => ({ ok: true as const }),
      }),
    )

    const result = await ensureSupervisorReady("cursor")

    expect(result).toEqual({
      ok: false,
      reason: "ACP supervisor failed to become ready",
    })
  })
})

describe("makeEnsureSessionBound", () => {
  test("skips agent start and load when the session is already bound", async () => {
    let started = 0
    let loaded = 0
    const ensureSessionBound = makeEnsureSessionBound({
      isSessionBound: () => true,
      ensureSupervisorReady: async () => {
        started += 1
        return { ok: true }
      },
      loadSession: async () => {
        loaded += 1
        return { ok: true }
      },
    })

    expect(
      await ensureSessionBound({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/ws" }),
    ).toEqual({
      ok: true,
    })
    expect(started).toBe(0)
    expect(loaded).toBe(0)
  })

  test("starts the agent and loads an unbound session", async () => {
    const started: string[] = []
    const loads: Array<{ agentId: string; sessionId: string; cwd: string }> = []
    const ensureSessionBound = makeEnsureSessionBound({
      isSessionBound: () => false,
      ensureSupervisorReady: async (agentId) => {
        started.push(agentId)
        return { ok: true }
      },
      loadSession: async (params) => {
        loads.push(params)
        return { ok: true }
      },
    })

    expect(
      await ensureSessionBound({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/ws" }),
    ).toEqual({
      ok: true,
    })
    expect(started).toEqual(["cursor"])
    expect(loads).toEqual([{ agentId: "cursor", sessionId: "s1", cwd: "/tmp/ws" }])
  })

  test("fails without loading when the agent cannot start", async () => {
    let loaded = 0
    const ensureSessionBound = makeEnsureSessionBound({
      isSessionBound: () => false,
      ensureSupervisorReady: async () => ({ ok: false, reason: "spawn exploded" }),
      loadSession: async () => {
        loaded += 1
        return { ok: true }
      },
    })

    expect(
      await ensureSessionBound({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/ws" }),
    ).toEqual({
      ok: false,
      reason: "spawn exploded",
    })
    expect(loaded).toBe(0)
  })

  test("passes authRequired through when the load fails on an auth error", async () => {
    const ensureSessionBound = makeEnsureSessionBound({
      isSessionBound: () => false,
      ensureSupervisorReady: async () => ({ ok: true }),
      loadSession: async () => ({
        ok: false,
        reason: "session/load failed: Authentication required",
        authRequired: true,
      }),
    })

    expect(
      await ensureSessionBound({ agentId: "cursor", sessionId: "s1", cwd: "/tmp/ws" }),
    ).toEqual({
      ok: false,
      reason: "session/load failed: Authentication required",
      authRequired: true,
    })
  })
})
