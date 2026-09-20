import { describe, expect, test } from "bun:test"
import { AgentId } from "contracts/http/agent-settings"
import { AcpStartResult } from "../acp/supervisor/models"
import { makeEnsureSupervisorReady } from "./session.acp.ready"

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
