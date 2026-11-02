import { describe, expect, test } from "bun:test"
import { bootTestDatabase } from "../test-support/test.harness"
import { makeSessionWorktreePathStore } from "./session.worktree.path.sqlite.adapters"

describe("session worktree path store", () => {
  test("gets, lists, upserts, and forgets a path", async () => {
    const { database } = await bootTestDatabase()
    const store = makeSessionWorktreePathStore(database)

    expect(store.get({ agentId: "cursor", sessionId: "sess_a" })).toBeUndefined()
    expect(store.list()).toEqual([])

    store.set({
      agentId: "cursor",
      sessionId: "sess_a",
      worktreePath: "/repo/.worktrees/a",
      updatedAt: "2026-11-02T00:00:00.000Z",
    })
    expect(store.get({ agentId: "cursor", sessionId: "sess_a" })).toBe("/repo/.worktrees/a")
    expect(store.list()).toEqual([
      {
        agentId: "cursor",
        sessionId: "sess_a",
        worktreePath: "/repo/.worktrees/a",
      },
    ])

    store.set({
      agentId: "cursor",
      sessionId: "sess_a",
      worktreePath: "/repo/.worktrees/b",
      updatedAt: "2026-11-02T00:01:00.000Z",
    })
    expect(store.get({ agentId: "cursor", sessionId: "sess_a" })).toBe("/repo/.worktrees/b")
    expect(store.list()).toHaveLength(1)

    store.forget({ agentId: "cursor", sessionId: "sess_a" })
    expect(store.get({ agentId: "cursor", sessionId: "sess_a" })).toBeUndefined()
    expect(store.list()).toEqual([])
  })

  test("reloads rows from sqlite", async () => {
    const { database } = await bootTestDatabase()
    makeSessionWorktreePathStore(database).set({
      agentId: "opencode",
      sessionId: "sess_b",
      worktreePath: "/repo/.worktrees/b",
      updatedAt: "2026-11-02T00:00:00.000Z",
    })

    expect(
      makeSessionWorktreePathStore(database).get({
        agentId: "opencode",
        sessionId: "sess_b",
      }),
    ).toBe("/repo/.worktrees/b")
  })
})
