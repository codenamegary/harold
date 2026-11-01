import { describe, expect, test } from "bun:test"
import {
  GitChangesQuerySchema,
  GitChangesSchema,
  GitFileDiffSchema,
  GitFileQuerySchema,
  GitPathQuerySchema,
  GitSummarySchema,
  GitWorktreeCollectionSchema,
} from "./git"

describe("git query schemas", () => {
  test("requires a path for summary and worktrees", () => {
    expect(GitPathQuerySchema.parse({ path: "/repo" })).toEqual({ path: "/repo" })
    expect(() => GitPathQuerySchema.parse({ path: "" })).toThrow()
    expect(() => GitPathQuerySchema.parse({ path: "/repo", extra: true })).toThrow()
  })

  test("requires a scope for changes", () => {
    expect(GitChangesQuerySchema.parse({ path: "/repo", scope: "branch" })).toEqual({
      path: "/repo",
      scope: "branch",
    })
    expect(() => GitChangesQuerySchema.parse({ path: "/repo" })).toThrow()
    expect(() => GitChangesQuerySchema.parse({ path: "/repo", scope: "staged" })).toThrow()
  })

  test("accepts an optional old path for file diffs", () => {
    expect(
      GitFileQuerySchema.parse({
        path: "/repo",
        scope: "uncommitted",
        file: "src/a.ts",
        oldPath: "src/old.ts",
      }),
    ).toEqual({
      path: "/repo",
      scope: "uncommitted",
      file: "src/a.ts",
      oldPath: "src/old.ts",
    })
    expect(
      GitFileQuerySchema.parse({
        path: "/repo",
        scope: "uncommitted",
        file: "src/a.ts",
      }),
    ).toEqual({ path: "/repo", scope: "uncommitted", file: "src/a.ts" })
  })
})

describe("git response schemas", () => {
  const repository = {
    root: "/repo",
    currentWorktreePath: "/repo",
    currentBranch: "feat/preview",
    defaultBranch: "main",
    headSha: "abc123",
  }

  test("accepts a summary", () => {
    expect(GitSummarySchema.parse({ repository, uncommittedFileCount: 3 })).toEqual({
      repository,
      uncommittedFileCount: 3,
    })
  })

  test("accepts worktrees with nullable dirty counts", () => {
    expect(
      GitWorktreeCollectionSchema.parse({
        items: [
          {
            path: "/repo",
            branch: "main",
            headSha: "abc123",
            isCurrent: true,
            isMain: true,
            dirtyFileCount: null,
          },
        ],
      }).items[0]?.dirtyFileCount,
    ).toBeNull()
  })

  test("accepts a changes payload with nullable stats", () => {
    expect(
      GitChangesSchema.parse({
        scope: "uncommitted",
        baseRef: null,
        mergeBaseSha: null,
        headSha: "abc123",
        files: [
          {
            path: "docs/logo.png",
            oldPath: null,
            status: "modified",
            additions: null,
            deletions: null,
            binary: true,
            submodule: false,
          },
        ],
        totals: { files: 1, additions: 0, deletions: 0 },
        truncated: false,
      }).files[0]?.binary,
    ).toBe(true)
  })

  test("accepts a file diff with additions and deletions", () => {
    expect(
      GitFileDiffSchema.parse({
        path: "src/a.ts",
        oldPath: null,
        status: "modified",
        additions: 4,
        deletions: 1,
        binary: false,
        submodule: false,
        hunks: [
          {
            header: "@@ -1,1 +1,2 @@",
            oldStart: 1,
            oldLines: 1,
            newStart: 1,
            newLines: 2,
            lines: [
              { kind: "context", oldLineNumber: 1, newLineNumber: 1, text: "a" },
              { kind: "addition", oldLineNumber: null, newLineNumber: 2, text: "b" },
            ],
          },
        ],
        truncated: false,
      }).hunks[0]?.lines[1]?.kind,
    ).toBe("addition")
  })

  test("rejects extra fields", () => {
    expect(() =>
      GitSummarySchema.parse({
        repository: { ...repository, nested: true },
        uncommittedFileCount: 0,
      }),
    ).toThrow()
  })
})
