import { describe, expect, test } from "bun:test"
import { assembleAgentSettingsSlice } from "./agent.settings.assembly"
import { acceptTestExecutablePath } from "../test-support/test.app"
import { bootTestDatabase } from "../test-support/test.harness"

const unusedCollaborator = () => {
  throw new Error("not used in this test")
}

describe("AgentSettings.hasAgentId", () => {
  test("returns true for catalog ids without calling presence", async () => {
    const { database } = await bootTestDatabase()
    let whichCalls = 0
    const agentSettings = assembleAgentSettingsSlice({
      database,
      whichFn: () => {
        whichCalls += 1
        return undefined
      },
      validateExecutablePathFn: acceptTestExecutablePath,
      acpSupervisor: unusedCollaborator,
      authBroker: unusedCollaborator,
    })

    expect(agentSettings.hasAgentId("cursor")).toBe(true)
    expect(agentSettings.hasAgentId("claude-acp")).toBe(true)
    expect(whichCalls).toBe(0)
  })

  test("returns true for custom agents that have a settings row", async () => {
    const { database } = await bootTestDatabase()
    const agentSettings = assembleAgentSettingsSlice({
      database,
      validateExecutablePathFn: acceptTestExecutablePath,
      acpSupervisor: unusedCollaborator,
      authBroker: unusedCollaborator,
    })

    const created = agentSettings.createCustomAgent()
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    expect(agentSettings.hasAgentId(created.value.id)).toBe(true)
    expect(agentSettings.hasAgentId("custom-missing-agent")).toBe(false)
    expect(agentSettings.hasAgentId("not-a-real-agent")).toBe(false)
  })
})
