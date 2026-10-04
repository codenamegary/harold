import { describe, expect, test } from "bun:test"
import { AgentSettingsRow, FindAgentSettingsRow } from "./agent.settings.ports"
import { makeHasAgentId } from "./agent.settings.has.agent.id.usecase"

const row = (agentId: string): AgentSettingsRow => ({
  agentId,
  enabled: false,
  path: null,
  args: null,
  spawnSnapshot: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
})

const makeFindRow = (rows: readonly AgentSettingsRow[]): FindAgentSettingsRow => {
  const rowsById = new Map(rows.map((item) => [item.agentId, item]))
  return (agentId) => rowsById.get(agentId)
}

describe("makeHasAgentId", () => {
  test("returns true for catalog ids without a row", () => {
    const hasAgentId = makeHasAgentId({ findRow: makeFindRow([]) })

    expect(hasAgentId("cursor")).toBe(true)
    expect(hasAgentId("claude-acp")).toBe(true)
  })

  test("returns true for custom agents that have a settings row", () => {
    const hasAgentId = makeHasAgentId({
      findRow: makeFindRow([row("custom-night-writer")]),
    })

    expect(hasAgentId("custom-night-writer")).toBe(true)
  })

  test("returns false for unknown ids", () => {
    const hasAgentId = makeHasAgentId({ findRow: makeFindRow([row("custom-night-writer")]) })

    expect(hasAgentId("custom-missing-agent")).toBe(false)
    expect(hasAgentId("not-a-real-agent")).toBe(false)
  })
})
