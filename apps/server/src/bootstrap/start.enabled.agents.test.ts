import { describe, expect, mock, test } from "bun:test"
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
  ...overrides,
})

describe("startEnabledAgents", () => {
  test("starts every enabled agent and skips disabled ones", async () => {
    const start = mock(async () => undefined)
    const info = mock(() => undefined)
    const warn = mock(() => undefined)

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

    expect(start).toHaveBeenCalledTimes(2)
    expect(start.mock.calls.map((call) => call[0]).sort()).toEqual([
      "claude-acp",
      "cursor",
    ])
    expect(results).toEqual([
      { agentId: "cursor", ok: true },
      { agentId: "claude-acp", ok: true },
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  test("returns empty when no agents are enabled", async () => {
    const start = mock(async () => undefined)
    const info = mock(() => undefined)
    const warn = mock(() => undefined)

    const results = await startEnabledAgents(
      {
        list: () => [agent({ id: "cursor", enabled: false })],
      },
      { start },
      { info, warn },
    )

    expect(start).not.toHaveBeenCalled()
    expect(results).toEqual([])
    expect(info).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  test("continues when one agent fails to start", async () => {
    const start = mock(async (agentId: string) => {
      if (agentId === "cursor") {
        throw new Error("spawn failed")
      }
    })
    const info = mock(() => undefined)
    const warn = mock(() => undefined)

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
      { agentId: "cursor", ok: false, error: expect.any(Error) },
      { agentId: "opencode", ok: true },
    ])
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[1]).toBe("failed to start enabled ACP agent")
  })
})
