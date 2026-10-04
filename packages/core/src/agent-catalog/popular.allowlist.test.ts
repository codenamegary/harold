import { describe, expect, test } from "bun:test"
import { catalogAgentIds } from "./generated/catalog.agents.generated"
import { popularAgentAllowlist } from "./popular.allowlist"

describe("popularAgentAllowlist", () => {
  test("every popular id exists in the generated catalog", () => {
    const catalogIdSet = new Set<string>(catalogAgentIds)

    for (const agentId of popularAgentAllowlist) {
      expect(catalogIdSet.has(agentId)).toBe(true)
    }
  })
})
