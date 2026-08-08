import { describe, expect, test } from "bun:test"
import { AgentSettings } from "contracts/http/agent-settings"
import { filterAgentSettings } from "./filter.agent.settings"

const cursor: AgentSettings = {
  id: "cursor",
  displayName: "Cursor",
  available: true,
  enabled: false,
  path: null,
  present: true,
  popular: true,
}

const claude: AgentSettings = {
  id: "claude-acp",
  displayName: "Claude Agent",
  available: false,
  enabled: false,
  path: null,
  present: true,
  popular: true,
}

describe("filterAgentSettings", () => {
  test("returns all agents when query is empty or whitespace", () => {
    expect(filterAgentSettings([cursor, claude], "")).toEqual([cursor, claude])
    expect(filterAgentSettings([cursor, claude], "   ")).toEqual([cursor, claude])
  })

  test("filters by displayName case-insensitively", () => {
    expect(filterAgentSettings([cursor, claude], "claude")).toEqual([claude])
  })

  test("filters by id case-insensitively", () => {
    expect(filterAgentSettings([cursor, claude], "CURSOR")).toEqual([cursor])
  })
})
