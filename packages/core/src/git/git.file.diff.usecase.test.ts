import { describe, expect, test } from "bun:test"
import { GitChanges } from "contracts/http/git"
import { makeGetGitFileDiff } from "./git.file.diff.usecase"
import { GitOperationResult } from "./git.errors"
import { ResolvedRepository } from "./git.models"
import { GitCommandResult, RunGit } from "./git.ports"

const repository: ResolvedRepository = {
  root: "/repo",
  currentWorktreePath: "/repo",
  currentBranch: "feat/x",
  defaultBranch: "main",
  headSha: "abc123",
  defaultRef: "refs/heads/main",
  mergeBaseSha: "base123",
}

const changes: GitChanges = {
  scope: "uncommitted",
  baseRef: null,
  mergeBaseSha: null,
  headSha: "abc123",
  files: [
    {
      path: "src/a.ts",
      oldPath: null,
      status: "modified",
      additions: 2,
      deletions: 1,
      binary: false,
      submodule: false,
    },
  ],
  totals: { files: 1, additions: 2, deletions: 1 },
  truncated: false,
}

const gitOk = (stdout: string): GitCommandResult => ({
  ok: true,
  value: { exitCode: 0, stdout, stderr: "", stdoutTruncated: false },
})

const resolve = async (): Promise<GitOperationResult<ResolvedRepository>> => ({
  ok: true,
  value: repository,
})

const getChanges = async (): Promise<GitOperationResult<GitChanges>> => ({
  ok: true,
  value: changes,
})

describe("get git file diff", () => {
  test("parses hunks and keeps file stats", async () => {
    const runGit: RunGit = async () =>
      gitOk(
        [
          "diff --git a/src/a.ts b/src/a.ts",
          "--- a/src/a.ts",
          "+++ b/src/a.ts",
          "@@ -1,2 +1,3 @@",
          " one",
          "-old",
          "+new",
          "+extra",
        ].join("\n"),
      )
    const getFileDiff = makeGetGitFileDiff({
      resolveRepository: resolve,
      getChanges,
      runGit,
    })

    const result = await getFileDiff({
      path: "/repo",
      scope: "uncommitted",
      file: "src/a.ts",
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.additions).toBe(2)
      expect(result.value.deletions).toBe(1)
      expect(result.value.hunks[0]?.lines.map((line) => line.kind)).toEqual([
        "context",
        "deletion",
        "addition",
        "addition",
      ])
    }
  })

  test("rejects absolute or traversing file paths", async () => {
    const getFileDiff = makeGetGitFileDiff({
      resolveRepository: resolve,
      getChanges,
      runGit: () => {
        throw new Error("runGit should not be called")
      },
    })

    expect(await getFileDiff({ path: "/repo", scope: "uncommitted", file: "../secret" })).toEqual({
      ok: false,
      error: {
        kind: "invalid_path",
        detail: "Invalid repository-relative path",
        pointer: "#/file",
      },
    })
  })

  test("returns not_found when the file is not in the change set", async () => {
    const getFileDiff = makeGetGitFileDiff({
      resolveRepository: resolve,
      getChanges,
      runGit: () => {
        throw new Error("runGit should not be called")
      },
    })

    expect(
      await getFileDiff({ path: "/repo", scope: "uncommitted", file: "src/other.ts" }),
    ).toEqual({
      ok: false,
      error: { kind: "not_found", detail: "That file is not part of this change set" },
    })
  })
})
