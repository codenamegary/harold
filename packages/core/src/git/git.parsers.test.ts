import { describe, expect, test } from "bun:test"
import {
  isSafeRepoRelativePath,
  parseNameStatus,
  parseNumstat,
  parseStatusEntries,
  parseUnifiedDiff,
  parseWorktreeList,
  totalsFor,
} from "./git.parsers"

const nul = (...values: ReadonlyArray<string>) => values.join("\0")

describe("parseStatusEntries", () => {
  test("parses modified, untracked, renamed, and conflicted entries", () => {
    const output = nul(
      "1 .M N... 100644 100644 100644 abc def src/a.ts",
      "? notes.txt",
      "2 R. N... 100644 100644 100644 abc def R100 src/new.ts",
      "src/old.ts",
      "u UU N... 100644 100644 100644 100644 a b c src/conflict.ts",
    )

    expect(parseStatusEntries(output)).toEqual([
      { path: "src/a.ts", oldPath: null, status: "modified", submodule: false },
      { path: "notes.txt", oldPath: null, status: "untracked", submodule: false },
      { path: "src/new.ts", oldPath: "src/old.ts", status: "renamed", submodule: false },
      { path: "src/conflict.ts", oldPath: null, status: "conflicted", submodule: false },
    ])
  })

  test("marks submodules from the sub field", () => {
    const output = nul("1 .M S... 160000 160000 160000 abc def vendor/sub")

    expect(parseStatusEntries(output)[0]?.submodule).toBe(true)
  })
})

describe("parseNumstat", () => {
  test("parses normal, binary, and renamed entries", () => {
    expect(
      parseNumstat(nul("4\t2\tsrc/a.ts", "-\t-\timage.png", "1\t0\t", "src/old.ts", "src/new.ts")),
    ).toEqual([
      { path: "src/a.ts", oldPath: null, additions: 4, deletions: 2, binary: false },
      { path: "image.png", oldPath: null, additions: null, deletions: null, binary: true },
      { path: "src/new.ts", oldPath: "src/old.ts", additions: 1, deletions: 0, binary: false },
    ])
  })
})

describe("parseNameStatus", () => {
  test("parses additions and renames", () => {
    expect(parseNameStatus(nul("A", "b.ts", "R050", "a.ts", "c.ts"))).toEqual([
      { path: "b.ts", oldPath: null, status: "added" },
      { path: "c.ts", oldPath: "a.ts", status: "renamed" },
    ])
  })
})

describe("parseWorktreeList", () => {
  test("parses branches, detached heads, and prunable entries", () => {
    const output = nul(
      "worktree /repo",
      "HEAD abc",
      "branch refs/heads/main",
      "",
      "worktree /repo/.worktrees/feat",
      "HEAD def",
      "branch refs/heads/feat/x",
      "",
      "worktree /repo/.worktrees/gone",
      "HEAD 123",
      "detached",
      "prunable gitdir file points to non-existent location",
      "",
    )

    expect(parseWorktreeList(output)).toEqual([
      { path: "/repo", headSha: "abc", branch: "main", prunable: false, bare: false },
      {
        path: "/repo/.worktrees/feat",
        headSha: "def",
        branch: "feat/x",
        prunable: false,
        bare: false,
      },
      {
        path: "/repo/.worktrees/gone",
        headSha: "123",
        branch: null,
        prunable: true,
        bare: false,
      },
    ])
  })
})

describe("parseUnifiedDiff", () => {
  test("assigns line numbers and drops an incomplete truncated hunk", () => {
    const output = [
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -10,2 +10,3 @@",
      " keep",
      "-old",
      "+new",
      "+extra",
      "@@ -20,2 +21,2 @@",
      " still",
      "+cut",
    ].join("\n")

    const parsed = parseUnifiedDiff(output, 2_000, true)

    expect(parsed.hunks).toHaveLength(1)
    expect(parsed.hunks[0]?.lines.map((line) => line.oldLineNumber)).toEqual([10, 11, null, null])
    expect(parsed.hunks[0]?.lines.map((line) => line.newLineNumber)).toEqual([10, null, 11, 12])
    expect(parsed.truncated).toBe(true)
  })

  test("truncates at the line cap", () => {
    const lines = ["@@ -1,3 +1,3 @@", " one", " two", " three", " four"]
    const parsed = parseUnifiedDiff(lines.join("\n"), 3)

    expect(parsed.truncated).toBe(true)
    expect(parsed.hunks[0]?.lines).toHaveLength(3)
  })
})

describe("path safety", () => {
  test("rejects absolute paths, traversal, and NUL bytes", () => {
    expect(isSafeRepoRelativePath("src/a.ts")).toBe(true)
    expect(isSafeRepoRelativePath("/etc/passwd")).toBe(false)
    expect(isSafeRepoRelativePath("../secret")).toBe(false)
    expect(isSafeRepoRelativePath("src/../../secret")).toBe(false)
    expect(isSafeRepoRelativePath("src/\0a.ts")).toBe(false)
  })
})

describe("totalsFor", () => {
  test("ignores null stats for binary files", () => {
    expect(
      totalsFor([
        { additions: 3, deletions: 1 },
        { additions: null, deletions: null },
      ]),
    ).toEqual({ files: 2, additions: 3, deletions: 1 })
  })
})
