import { describe, expect, test } from "bun:test"
import { bootTestDatabase } from "../test-support/test.harness"
import { createArchivedAcpSessionsStore } from "./archived.acp.sessions.store"

describe("archived ACP sessions store", () => {
  test("loads rows from sqlite and filters by agentId plus sessionId", async () => {
    const { database } = await bootTestDatabase()

    const first = createArchivedAcpSessionsStore(database)
    first.archive({ agentId: "cursor", sessionId: "sess_a" })
    expect(first.isArchived({ agentId: "cursor", sessionId: "sess_a" })).toBe(true)
    expect(first.isArchived({ agentId: "cursor", sessionId: "sess_b" })).toBe(false)
    expect(first.isArchived({ agentId: "opencode", sessionId: "sess_a" })).toBe(false)

    first.archive({ agentId: "cursor", sessionId: "sess_a" })

    const reloaded = createArchivedAcpSessionsStore(database)
    expect(reloaded.isArchived({ agentId: "cursor", sessionId: "sess_a" })).toBe(true)
  })
})
