import { GitFileDiff, GitScope } from "contracts/http/git"
import path from "node:path"
import { GetGitChanges } from "./git.changes.usecase"
import { GitOperationResult } from "./git.errors"
import { fromGitCommandFailure } from "./git.errors"
import { ResolveRepository } from "./git.resolve.repository.usecase"
import { isSafeRepoRelativePath, parseUnifiedDiff } from "./git.parsers"
import { RunGit } from "./git.ports"

const READ_TIMEOUT_MS = 10_000
const MAX_DIFF_BYTES = 1 * 1024 * 1024
const MAX_DIFF_LINES = 2_000

export type GetGitFileDiffDeps = Readonly<{
  resolveRepository: ResolveRepository
  getChanges: GetGitChanges
  runGit: RunGit
}>

export type GetGitFileDiff = (params: {
  path: string
  scope: GitScope
  file: string
  oldPath?: string
}) => Promise<GitOperationResult<GitFileDiff>>

export const makeGetGitFileDiff =
  (deps: GetGitFileDiffDeps): GetGitFileDiff =>
  async ({ path: worktreePath, scope, file: filePath, oldPath }) => {
    if (!isSafeRepoRelativePath(filePath)) {
      return {
        ok: false,
        error: {
          kind: "invalid_path",
          detail: "Invalid repository-relative path",
          pointer: "#/file",
        },
      }
    }
    if (oldPath !== undefined && !isSafeRepoRelativePath(oldPath)) {
      return {
        ok: false,
        error: {
          kind: "invalid_path",
          detail: "Invalid repository-relative path",
          pointer: "#/oldPath",
        },
      }
    }

    const repositoryResult = await deps.resolveRepository({ path: worktreePath })
    if (!repositoryResult.ok) {
      return repositoryResult
    }
    const repository = repositoryResult.value

    const changesResult = await deps.getChanges({ path: worktreePath, scope })
    if (!changesResult.ok) {
      return changesResult
    }
    const file = changesResult.value.files.find((candidate) => candidate.path === filePath)
    if (file === undefined) {
      return {
        ok: false,
        error: { kind: "not_found", detail: "That file is not part of this change set" },
      }
    }
    if (oldPath !== undefined && file.oldPath !== oldPath) {
      return {
        ok: false,
        error: { kind: "not_found", detail: "That rename is not part of this change set" },
      }
    }

    if (file.binary || file.submodule) {
      return {
        ok: true,
        value: {
          path: file.path,
          oldPath: file.oldPath,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          binary: file.binary,
          submodule: file.submodule,
          hunks: [],
          truncated: false,
        },
      }
    }

    const isUntracked = scope === "uncommitted" && file.status === "untracked"
    const paths = file.oldPath === null ? [file.path] : [file.oldPath, file.path]
    const args = isUntracked
      ? [
          "diff",
          "--no-index",
          "--no-color",
          "--no-ext-diff",
          "--unified=3",
          "--",
          "/dev/null",
          path.resolve(repository.root, file.path),
        ]
      : scope === "branch"
        ? [
            "diff",
            "--no-color",
            "--no-ext-diff",
            "--unified=3",
            "--find-renames",
            repository.mergeBaseSha ?? "",
            "HEAD",
            "--",
            ...paths,
          ]
        : ["diff", "HEAD", "--no-color", "--no-ext-diff", "--unified=3", "--", ...paths]

    if (scope === "branch" && repository.mergeBaseSha === null) {
      return {
        ok: false,
        error: {
          kind: "branch_unavailable",
          detail: "No merge base with the default branch",
        },
      }
    }

    const result = await deps.runGit({
      cwd: repository.root,
      args,
      allowExitCodes: isUntracked ? [0, 1] : [0],
      timeoutMs: READ_TIMEOUT_MS,
      maxStdoutBytes: MAX_DIFF_BYTES,
    })
    if (!result.ok) {
      return { ok: false, error: fromGitCommandFailure(result.error) }
    }
    if (result.value.exitCode !== 0 && !isUntracked) {
      return {
        ok: false,
        error: {
          kind: "git_failed",
          detail: result.value.stderr.trim() || "git diff failed",
        },
      }
    }

    const parsed = parseUnifiedDiff(
      result.value.stdout,
      MAX_DIFF_LINES,
      result.value.stdoutTruncated,
    )
    return {
      ok: true,
      value: {
        path: file.path,
        oldPath: file.oldPath,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        binary: false,
        submodule: false,
        hunks: [...parsed.hunks],
        truncated: parsed.truncated,
      },
    }
  }
