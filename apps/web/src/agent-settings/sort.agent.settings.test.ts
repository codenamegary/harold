import { describe, expect, test } from "bun:test"
import { AgentSettings } from "contracts/http/agent-settings"
import { sortAgentSettings } from "./sort.agent.settings"

const agent = (overrides: Partial<AgentSettings> & Pick<AgentSettings, "id" | "displayName">): AgentSettings => ({
  available: true,
  enabled: false,
  path: null,
  args: [],
  present: false,
  popular: false,
  deletable: false,
  sessionListSupported: true,
  state: { status: "stopped", error: null },
  ...overrides,
})

describe("sortAgentSettings", () => {
  test("orders enabled → present → popular → rest", () => {
    const enabled = agent({
      id: "cursor",
      displayName: "Cursor",
      enabled: true,
      present: true,
      popular: true,
      deletable: false,
  sessionListSupported: true,
  state: { status: "stopped", error: null },
    })
    const claudeAcp = agent({
      id: "claude-acp",
      displayName: "Claude Agent",
      enabled: false,
      present: true,
      popular: true,
      deletable: false,
  sessionListSupported: true,
  state: { status: "stopped", error: null },
    })
    const auggie = agent({
      id: "auggie",
      displayName: "Auggie",
      enabled: false,
      present: false,
      popular: true,
      deletable: false,
  sessionListSupported: true,
  state: { status: "stopped", error: null },
    })
    const rest = agent({
      id: "rest-agent",
      displayName: "Rest Agent",
      enabled: false,
      present: false,
      popular: false,
      deletable: false,
  sessionListSupported: true,
  state: { status: "stopped", error: null },
    })

    const sorted = sortAgentSettings([auggie, rest, claudeAcp, enabled])

    expect(sorted.map((item) => item.id)).toEqual([
      "cursor",
      "claude-acp",
      "auggie",
      "rest-agent",
    ])
  })

  test("keeps custom agents ahead of catalog bands", () => {
    const custom = agent({
      id: "custom-custom-agent",
      displayName: "Custom Agent",
      deletable: true,
  sessionListSupported: true,
  state: { status: "stopped", error: null },
    })
    const enabled = agent({
      id: "cursor",
      displayName: "Cursor",
      enabled: true,
      present: true,
      popular: true,
    })

    expect(sortAgentSettings([enabled, custom]).map((item) => item.id)).toEqual([
      "custom-custom-agent",
      "cursor",
    ])
  })
})
