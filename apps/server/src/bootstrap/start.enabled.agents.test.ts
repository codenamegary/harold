import { describe, expect, test } from "bun:test"
import { AgentSettings } from "contracts/http/agent-settings"
import { startEnabledAgents } from "./start.enabled.agents"

const agent = (overrides: Partial<AgentSettings> & Pick<AgentSettings, "id">): AgentSettings => ({
  displayName: overrides.id,
  available: true,
  enabled: false,
  path: "/bin/agent",
  args: [],
  present: true,
  popular: true,
  deletable: false,
  state: { status: "stopped", error: null },
  capabilities: null,
  ...overrides,
})

type StartStub = (agentId: string) => Promise<{ ok: true } | { ok: false; reason: string }>

const makeStartStub = (
  startOutcome: (agentId: string) => { ok: true } | { ok: false; reason: string },
): { start: StartStub; calls: string[] } => {
  const calls: string[] = []
  return {
    calls,
    start: async (agentId: string) => {
      calls.push(agentId)
      return startOutcome(agentId)
    },
  }
}

describe("startEnabledAgents", () => {
  test("starts every enabled agent and skips disabled ones", async () => {
    const { start, calls } = makeStartStub(() => ({ ok: true }))
    const info = () => undefined
    const warn = () => undefined

    const results = await startEnabledAgents(
      {
        list: () => [
          agent({ id: "cursor", enabled: true }),
          agent({ id: "opencode", enabled: false }),
          agent({ id: "claude-acp", enabled: true }),
        ],
      },
      { start },
      { info, warn },
    )

    expect(calls.slice().sort((left, right) => left.localeCompare(right))).toEqual([
      "claude-acp",
      "cursor",
    ])
    expect(results).toEqual([
      { agentId: "cursor", ok: true },
      { agentId: "claude-acp", ok: true },
    ])
  })

  test("returns empty when no agents are enabled", async () => {
    const { start, calls } = makeStartStub(() => ({ ok: true }))
    const info = () => undefined
    const warn = () => undefined

    const results = await startEnabledAgents(
      {
        list: () => [agent({ id: "cursor", enabled: false })],
      },
      { start },
      { info, warn },
    )

    expect(calls).toEqual([])
    expect(results).toEqual([])
  })

  test("continues when one agent fails to start", async () => {
    const { start } = makeStartStub((agentId) =>
      agentId === "cursor" ? { ok: false, reason: "spawn failed" } : { ok: true },
    )
    const warnings: Array<{ obj: object; msg: string }> = []
    const info = () => undefined
    const warn = (obj: object, msg: string) => warnings.push({ obj, msg })

    const results = await startEnabledAgents(
      {
        list: () => [
          agent({ id: "cursor", enabled: true }),
          agent({ id: "opencode", enabled: true }),
        ],
      },
      { start },
      { info, warn },
    )

    expect(results).toEqual([
      { agentId: "cursor", ok: false, error: "spawn failed" },
      { agentId: "opencode", ok: true },
    ])
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.msg).toBe("failed to start enabled ACP agent")
  })
})
