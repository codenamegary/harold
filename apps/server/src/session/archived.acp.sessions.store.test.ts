import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { openDatabase } from "../persistence/database"
import { createArchivedAcpSessionsStore } from "./archived.acp.sessions.store"

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("archived ACP sessions store", () => {
  test("loads rows from sqlite and filters by agentId plus sessionId", async () => {
    const dataDir = await mkdtemp(path.join(os.tmpdir(), "archived-acp-"))
    tempDirs.push(dataDir)
    const database = openDatabase({ dataDir })

    const first = createArchivedAcpSessionsStore(database)
    first.archive({ agentId: "cursor", sessionId: "sess_a" })
    expect(first.isArchived({ agentId: "cursor", sessionId: "sess_a" })).toBe(true)
    expect(first.isArchived({ agentId: "cursor", sessionId: "sess_b" })).toBe(false)
    expect(first.isArchived({ agentId: "opencode", sessionId: "sess_a" })).toBe(false)

    first.archive({ agentId: "cursor", sessionId: "sess_a" })

    const reloaded = createArchivedAcpSessionsStore(database)
    expect(reloaded.isArchived({ agentId: "cursor", sessionId: "sess_a" })).toBe(true)

    database.close()
  })
})
