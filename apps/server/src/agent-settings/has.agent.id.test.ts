import { describe, expect, test } from "bun:test"
import { createAgentSettingsRepository } from "./agent-settings-repository"
import { acceptTestExecutablePath } from "../test-support/test.app"
import { bootTestDatabase } from "../test-support/test.harness"

describe("AgentSettingsRepository.hasAgentId", () => {
  test("returns true for catalog ids without calling presence", async () => {
    const { database } = await bootTestDatabase()
    let whichCalls = 0
    const repository = createAgentSettingsRepository(database, {
      whichFn: () => {
        whichCalls += 1
        return undefined
      },
      validateExecutablePathFn: acceptTestExecutablePath,
    })

    expect(repository.hasAgentId("cursor")).toBe(true)
    expect(repository.hasAgentId("claude-acp")).toBe(true)
    expect(whichCalls).toBe(0)
  })

  test("returns true for custom agents that have a settings row", async () => {
    const { database } = await bootTestDatabase()
    const repository = createAgentSettingsRepository(database, {
      validateExecutablePathFn: acceptTestExecutablePath,
    })

    const created = repository.createCustom()
    expect(created.ok).toBe(true)
    if (!created.ok) {
      return
    }

    expect(repository.hasAgentId(created.value.id)).toBe(true)
    expect(repository.hasAgentId("custom-missing-agent")).toBe(false)
    expect(repository.hasAgentId("not-a-real-agent")).toBe(false)
  })
})
