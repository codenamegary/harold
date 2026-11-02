import { describe, expect, test } from "bun:test"
import { GitWorktree } from "contracts/http/git"
import { parseSessionWorktreePathCandidate } from "./session.worktree.path.candidates"
import { createSessionWorktreePathTracker } from "./session.worktree.path.tracker"

const worktree = (path: string): GitWorktree => ({
  path,
  branch: null,
  headSha: "abc1234",
  isCurrent: false,
  isMain: false,
  dirtyFileCount: null,
})

const listed = (...paths: string[]) => ({
  ok: true as const,
  value: { items: paths.map(worktree) },
})

const trackerHarness = (
  options: {
    paths?: string[]
    stored?: string
    listError?: unknown
  } = {},
) => {
  const calls = { list: 0, set: [] as Array<{ worktreePath: string }> }
  const logs: string[] = []
  const tracker = createSessionWorktreePathTracker({
    listWorktrees: async () => {
      calls.list += 1
      if (options.listError !== undefined) {
        throw options.listError
      }
      return listed(...(options.paths ?? []))
    },
    getSessionWorktreePath: () => options.stored,
    setSessionWorktreePath: (params) => {
      calls.set.push({ worktreePath: params.worktreePath })
    },
    now: () => "2026-11-02T00:00:00.000Z",
    log: ({ message }) => {
      logs.push(message)
    },
  })
  return { tracker, calls, logs }
}

const edit = (toolCallId: string, path: string) => ({
  sessionUpdate: "tool_call",
  toolCallId,
  kind: "edit",
  rawInput: { file_path: path },
})

describe("parseSessionWorktreePathCandidate", () => {
  test("reads absolute paths from locations, diff content, and rawInput", () => {
    expect(
      parseSessionWorktreePathCandidate({
        sessionUpdate: "tool_call",
        toolCallId: "t1",
        kind: "edit",
        locations: [{ path: "/repo/.worktrees/a/file.ts" }, { path: "relative.ts" }],
        content: [{ type: "diff", path: "/repo/.worktrees/b/file.ts" }],
        rawInput: {
          file_path: "/repo/.worktrees/c/file.ts",
          path: "/repo/.worktrees/d/file.ts",
          oldPath: "/repo/.worktrees/e/old.ts",
          newPath: "/repo/.worktrees/f/new.ts",
        },
      }),
    ).toEqual({
      toolCallId: "t1",
      kind: "edit",
      path: "/repo/.worktrees/f/new.ts",
    })
  })

  test("tracks the kind by toolCallId when an update omits it", () => {
    expect(
      parseSessionWorktreePathCandidate(
        {
          sessionUpdate: "tool_call_update",
          toolCallId: "t1",
          rawInput: { file_path: "/repo/.worktrees/a/file.ts" },
        },
        "delete",
      ),
    ).toEqual({
      toolCallId: "t1",
      kind: "delete",
      path: "/repo/.worktrees/a/file.ts",
    })
  })

  test("accepts write as edit and rejects other kinds", () => {
    expect(
      parseSessionWorktreePathCandidate({
        sessionUpdate: "tool_call",
        toolCallId: "t1",
        kind: "write",
        rawInput: { path: "/repo/file.ts" },
      })?.kind,
    ).toBe("edit")

    for (const kind of ["read", "search", "execute"]) {
      expect(
        parseSessionWorktreePathCandidate({
          sessionUpdate: "tool_call",
          toolCallId: "t1",
          kind,
          rawInput: { path: "/repo/file.ts" },
        }),
      ).toBeNull()
    }
  })

  test("ignores relative paths", () => {
    expect(
      parseSessionWorktreePathCandidate({
        sessionUpdate: "tool_call",
        toolCallId: "t1",
        kind: "move",
        rawInput: { oldPath: "old.ts", newPath: "new.ts" },
      }),
    ).toBeNull()
  })
})

describe("session worktree path tracker", () => {
  const ref = { agentId: "cursor" as const, sessionId: "s1" }

  test("ignores updates outside an active turn", async () => {
    const { tracker, calls } = trackerHarness({ paths: ["/repo/.worktrees/a"] })
    tracker.observeUpdate({ ...ref, update: edit("t1", "/repo/.worktrees/a/file.ts") })

    expect(await tracker.finishTurn({ ...ref, cwd: "/repo" })).toBeNull()
    expect(calls.list).toBe(0)
  })

  test("picks the last matching edit and persists once", async () => {
    const { tracker, calls } = trackerHarness({
      paths: ["/repo", "/repo/.worktrees/a", "/repo/.worktrees/b"],
    })
    tracker.startTurn(ref)
    tracker.observeUpdate({ ...ref, update: edit("t1", "/repo/.worktrees/a/file.ts") })
    tracker.observeUpdate({ ...ref, update: edit("t2", "/repo/.worktrees/b/file.ts") })
    tracker.observeUpdate({ ...ref, update: edit("t2", "/repo/.worktrees/a/other.ts") })

    expect(await tracker.finishTurn({ ...ref, cwd: "/repo" })).toEqual({
      worktreePath: "/repo/.worktrees/a",
    })
    expect(calls.set).toEqual([{ worktreePath: "/repo/.worktrees/a" }])

    expect(await tracker.finishTurn({ ...ref, cwd: "/repo" })).toBeNull()
    expect(calls.list).toBe(1)
  })

  test("does not call git when no candidates were observed", async () => {
    const { tracker, calls } = trackerHarness({ paths: ["/repo"] })
    tracker.startTurn(ref)

    expect(await tracker.finishTurn({ ...ref, cwd: "/repo" })).toBeNull()
    expect(calls.list).toBe(0)
  })

  test("keeps the stored path when no candidate matches a worktree", async () => {
    const { tracker, calls } = trackerHarness({
      paths: ["/repo"],
      stored: "/repo/.worktrees/a",
    })
    tracker.startTurn(ref)
    tracker.observeUpdate({ ...ref, update: edit("t1", "/tmp/elsewhere/file.ts") })

    expect(await tracker.finishTurn({ ...ref, cwd: "/repo" })).toBeNull()
    expect(calls.set).toEqual([])
  })

  test("returns null when the match equals the stored path", async () => {
    const { tracker, calls } = trackerHarness({
      paths: ["/repo/.worktrees/a"],
      stored: "/repo/.worktrees/a",
    })
    tracker.startTurn(ref)
    tracker.observeUpdate({ ...ref, update: edit("t1", "/repo/.worktrees/a/file.ts") })

    expect(await tracker.finishTurn({ ...ref, cwd: "/repo" })).toBeNull()
    expect(calls.set).toEqual([])
  })

  test("logs detection failures instead of throwing", async () => {
    const { tracker, calls, logs } = trackerHarness({ listError: new Error("git failed") })
    tracker.startTurn(ref)
    tracker.observeUpdate({ ...ref, update: edit("t1", "/repo/.worktrees/a/file.ts") })

    expect(await tracker.finishTurn({ ...ref, cwd: "/repo" })).toBeNull()
    expect(calls.set).toEqual([])
    expect(logs).toHaveLength(1)
  })

  test("remembers the declared kind when a later update omits it", async () => {
    const { tracker } = trackerHarness({ paths: ["/repo/.worktrees/a"] })
    tracker.startTurn(ref)
    tracker.observeUpdate({
      ...ref,
      update: { sessionUpdate: "tool_call", toolCallId: "t1", kind: "edit" },
    })
    tracker.observeUpdate({
      ...ref,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId: "t1",
        rawInput: { file_path: "/repo/.worktrees/a/file.ts" },
      },
    })

    expect(await tracker.finishTurn({ ...ref, cwd: "/repo" })).toEqual({
      worktreePath: "/repo/.worktrees/a",
    })
  })

  test("forget clears candidates for a deleted session", async () => {
    const { tracker, calls } = trackerHarness({ paths: ["/repo"] })
    tracker.startTurn(ref)
    tracker.observeUpdate({ ...ref, update: edit("t1", "/repo/file.ts") })
    tracker.forget(ref)

    expect(await tracker.finishTurn({ ...ref, cwd: "/repo" })).toBeNull()
    expect(calls.list).toBe(0)
  })
})
