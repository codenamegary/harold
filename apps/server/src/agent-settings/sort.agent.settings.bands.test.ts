import { describe, expect, test } from "bun:test"
import { AgentSettings } from "contracts/http/agent-settings"
import { sortAgentSettingsBands } from "./agent-registry"

const agent = (overrides: Partial<AgentSettings> & Pick<AgentSettings, "id" | "displayName">): AgentSettings => ({
  available: true,
  enabled: false,
  path: null,
  args: [],
  present: false,
  popular: false,
  ...overrides,
})

describe("sortAgentSettingsBands", () => {
  test("orders enabled → present → popular → rest", () => {
    const enabled = agent({
      id: "cursor",
      displayName: "Cursor",
      enabled: true,
      present: true,
      popular: true,
    })
    const claudeAcp = agent({
      id: "claude-acp",
      displayName: "Claude Agent",
      enabled: false,
      present: true,
      popular: true,
    })
    const auggie = agent({
      id: "auggie",
      displayName: "Auggie",
      enabled: false,
      present: false,
      popular: true,
    })
    const rest = agent({
      id: "rest-agent",
      displayName: "Rest Agent",
      enabled: false,
      present: false,
      popular: false,
    })

    const sorted = sortAgentSettingsBands([auggie, rest, claudeAcp, enabled])

    expect(sorted.map((item) => item.id)).toEqual([
      "cursor",
      "claude-acp",
      "auggie",
      "rest-agent",
    ])
  })
})
