import { describe, expect, test } from "bun:test"
import { AgentId, AgentIdSchema, AgentSettings } from "contracts/http/agent-settings"
import { makeResolveAgentGate } from "./session.resolve.agent.gate.usecase"

const agentId = AgentIdSchema.parse("cursor")

const agentSettings = (overrides: Partial<AgentSettings> = {}): AgentSettings => ({
  id: agentId,
  displayName: "Cursor",
  available: true,
  enabled: true,
  path: "/usr/local/bin/agent",
  args: [],
  present: true,
  popular: true,
  deletable: false,
  state: { status: "stopped", error: null },
  capabilities: null,
  ...overrides,
})

describe("makeResolveAgentGate", () => {
  test("returns the settings when the agent is found, available, and enabled", async () => {
    const settings = agentSettings()
    const resolveAgentGate = makeResolveAgentGate({
      findAgentSettings: (id: AgentId) => (id === agentId ? settings : undefined),
    })

    const result = await resolveAgentGate({ agentId })

    expect(result).toEqual({ ok: true, value: settings })
  })

  test("returns AGENT_NOT_FOUND when the agent has no settings", async () => {
    const resolveAgentGate = makeResolveAgentGate({
      findAgentSettings: () => undefined,
    })

    const result = await resolveAgentGate({ agentId })

    expect(result).toEqual({ ok: false, error: { kind: "AGENT_NOT_FOUND" } })
  })

  test("returns AGENT_UNAVAILABLE when the agent is not available", async () => {
    const resolveAgentGate = makeResolveAgentGate({
      findAgentSettings: () => agentSettings({ available: false }),
    })

    const result = await resolveAgentGate({ agentId })

    expect(result).toEqual({ ok: false, error: { kind: "AGENT_UNAVAILABLE" } })
  })

  test("returns AGENT_DISABLED when the agent is not enabled", async () => {
    const resolveAgentGate = makeResolveAgentGate({
      findAgentSettings: () => agentSettings({ enabled: false }),
    })

    const result = await resolveAgentGate({ agentId })

    expect(result).toEqual({ ok: false, error: { kind: "AGENT_DISABLED" } })
  })
})
