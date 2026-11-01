import { GitChangedFile, GitChanges, GitScope } from "contracts/http/git"
import path from "node:path"
import { mapWithConcurrency } from "./git.concurrency"
import { GitOperationError, GitOperationResult } from "./git.errors"
import { fromGitCommandFailure } from "./git.errors"
import { ResolvedRepository } from "./git.models"
import { ParsedNameStatus, ParsedNumstat } from "./git.parsers"
import { isSubmoduleLsTree, parseNameStatus, parseNumstat } from "./git.parsers"
import { ResolveRepository } from "./git.resolve.repository.usecase"
import { readStatusEntries, readUncommittedNumstat } from "./git.status"
import { RunGit } from "./git.ports"

const READ_TIMEOUT_MS = 10_000
const MAX_FILES = 2_000
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const STAT_CONCURRENCY = 4

export type GetGitChangesDeps = Readonly<{
  resolveRepository: ResolveRepository
  runGit: RunGit
}>

export type GetGitChanges = (params: {
  path: string
  scope: GitScope
}) => Promise<GitOperationResult<GitChanges>>

type DiffReadResult =
  | { ok: true; stdout: string; truncated: boolean }
  | { ok: false; error: GitOperationError }

const readDiff = async (
  runGit: RunGit,
  cwd: string,
  args: ReadonlyArray<string>,
): Promise<DiffReadResult> => {
  const result = await runGit({
    cwd,
    args,
    allowExitCodes: [0],
    timeoutMs: READ_TIMEOUT_MS,
    maxStdoutBytes: MAX_OUTPUT_BYTES,
  })
  if (!result.ok) {
    return { ok: false, error: fromGitCommandFailure(result.error) }
  }
  if (result.value.exitCode !== 0) {
    return {
      ok: false,
      error: {
        kind: "git_failed",
        detail: result.value.stderr.trim() || "git diff failed",
      },
    }
  }
  return {
    ok: true,
    stdout: result.value.stdout,
    truncated: result.value.stdoutTruncated,
  }
}

const totalsFor = (files: ReadonlyArray<GitChangedFile>) => ({
  files: files.length,
  additions: files.reduce((total, file) => total + (file.additions ?? 0), 0),
  deletions: files.reduce((total, file) => total + (file.deletions ?? 0), 0),
})

export const makeGetGitChanges =
  (deps: GetGitChangesDeps): GetGitChanges =>
  async ({ path: worktreePath, scope }) => {
    const repositoryResult = await deps.resolveRepository({ path: worktreePath })
    if (!repositoryResult.ok) {
      return repositoryResult
    }
    const repository = repositoryResult.value

    if (scope === "uncommitted") {
      return readUncommittedChanges(deps.runGit, repository)
    }
    return readBranchChanges(deps.runGit, repository)
  }

const readUncommittedChanges = async (
  runGit: RunGit,
  repository: ResolvedRepository,
): Promise<GitOperationResult<GitChanges>> => {
  const status = await readStatusEntries(runGit, repository.root)
  if (!status.ok) {
    return { ok: false, error: status.error }
  }

  const numstat = await readUncommittedNumstat(runGit, repository.root)
  if (!numstat.ok) {
    return { ok: false, error: numstat.error }
  }

  const entries = status.entries.slice(0, MAX_FILES)
  const statsByPath = new Map(numstat.entries.map((entry) => [entry.path, entry]))
  const untrackedStats = new Map<string, ParsedNumstat>()
  const untrackedEntries = entries.filter((entry) => entry.status === "untracked")

  await mapWithConcurrency(untrackedEntries, STAT_CONCURRENCY, async (entry) => {
    const result = await runGit({
      cwd: repository.root,
      args: [
        "diff",
        "--no-index",
        "--numstat",
        "-z",
        "--",
        "/dev/null",
        path.resolve(repository.root, entry.path),
      ],
      allowExitCodes: [0, 1],
      timeoutMs: READ_TIMEOUT_MS,
      maxStdoutBytes: MAX_OUTPUT_BYTES,
    })
    if (!result.ok) {
      return
    }
    const parsed = parseNumstat(result.value.stdout)[0]
    if (parsed !== undefined) {
      untrackedStats.set(entry.path, parsed)
    }
  })

  const files: GitChangedFile[] = entries.map((entry) => {
    const stats =
      entry.status === "untracked" ? untrackedStats.get(entry.path) : statsByPath.get(entry.path)
    return {
      path: entry.path,
      oldPath: entry.oldPath,
      status: entry.status,
      additions: entry.submodule ? null : (stats?.additions ?? null),
      deletions: entry.submodule ? null : (stats?.deletions ?? null),
      binary: entry.submodule ? false : (stats?.binary ?? false),
      submodule: entry.submodule,
    }
  })

  return {
    ok: true,
    value: {
      scope: "uncommitted",
      baseRef: null,
      mergeBaseSha: null,
      headSha: repository.headSha,
      files,
      totals: totalsFor(files),
      truncated: status.truncated || numstat.truncated || status.entries.length > MAX_FILES,
    },
  }
}

const readBranchChanges = async (
  runGit: RunGit,
  repository: ResolvedRepository,
): Promise<GitOperationResult<GitChanges>> => {
  if (repository.defaultRef === null || repository.mergeBaseSha === null) {
    return {
      ok: false,
      error: {
        kind: "branch_unavailable",
        detail: "No merge base with the default branch",
      },
    }
  }
  const mergeBaseSha = repository.mergeBaseSha

  const nameStatus = await readDiff(runGit, repository.root, [
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    mergeBaseSha,
    "HEAD",
  ])
  if (!nameStatus.ok) {
    return { ok: false, error: nameStatus.error }
  }

  const numstat = await readDiff(runGit, repository.root, [
    "diff",
    "--numstat",
    "-z",
    "--find-renames",
    mergeBaseSha,
    "HEAD",
  ])
  if (!numstat.ok) {
    return { ok: false, error: numstat.error }
  }

  const allNameStatuses = parseNameStatus(nameStatus.stdout)
  const entries = allNameStatuses.slice(0, MAX_FILES)
  const statsByPath = new Map(parseNumstat(numstat.stdout).map((entry) => [entry.path, entry]))

  const submodules = await mapWithConcurrency(
    entries,
    STAT_CONCURRENCY,
    async (entry: ParsedNameStatus) => {
      const stats = statsByPath.get(entry.path)
      if (stats?.binary !== true) {
        return false
      }
      const ref = entry.status === "deleted" ? mergeBaseSha : "HEAD"
      const result = await runGit({
        cwd: repository.root,
        args: ["ls-tree", "-z", ref, "--", entry.path],
        allowExitCodes: [0, 128],
        timeoutMs: READ_TIMEOUT_MS,
      })
      return result.ok && result.value.exitCode === 0 && isSubmoduleLsTree(result.value.stdout)
    },
  )

  const files: GitChangedFile[] = entries.map((entry, index) => {
    const stats = statsByPath.get(entry.path)
    const submodule = submodules[index] === true
    return {
      path: entry.path,
      oldPath: entry.oldPath,
      status: entry.status,
      additions: submodule ? null : (stats?.additions ?? null),
      deletions: submodule ? null : (stats?.deletions ?? null),
      binary: submodule ? false : (stats?.binary ?? false),
      submodule,
    }
  })

  return {
    ok: true,
    value: {
      scope: "branch",
      baseRef: repository.defaultRef,
      mergeBaseSha: mergeBaseSha,
      headSha: repository.headSha,
      files,
      totals: totalsFor(files),
      truncated: nameStatus.truncated || numstat.truncated || allNameStatuses.length > MAX_FILES,
    },
  }
}
