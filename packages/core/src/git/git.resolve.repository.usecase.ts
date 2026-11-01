import { CanonicalizePath } from "../filesystem/filesystem.ports"
import { GitOperationError, GitOperationResult } from "./git.errors"
import { ResolvedRepository } from "./git.models"
import { ZERO_SHA, stripRef } from "./git.parsers"
import { GitCommandFailure, RunGit } from "./git.ports"

export type ResolveRepositoryDeps = Readonly<{
  canonicalizePath: CanonicalizePath
  runGit: RunGit
}>

export type ResolveRepository = (params: {
  path: string
}) => Promise<GitOperationResult<ResolvedRepository>>

const fromCommandFailure = (error: GitCommandFailure): GitOperationError =>
  error.kind === "unavailable"
    ? { kind: "git_unavailable" }
    : { kind: "git_failed", detail: error.detail }

const PROBE_TIMEOUT_MS = 5_000

const defaultBranchCandidates = [
  "refs/heads/main",
  "refs/heads/master",
  "refs/remotes/origin/main",
  "refs/remotes/origin/master",
] as const

export const makeResolveRepository =
  (deps: ResolveRepositoryDeps): ResolveRepository =>
  async ({ path }) => {
    const canonical = deps.canonicalizePath(path)
    if (!canonical.ok) {
      return { ok: false, error: { kind: "path", error: canonical.error } }
    }

    const rootResult = await deps.runGit({
      cwd: canonical.canonicalPath,
      args: ["rev-parse", "--show-toplevel"],
      allowExitCodes: [0, 128],
      timeoutMs: PROBE_TIMEOUT_MS,
    })
    if (!rootResult.ok) {
      return { ok: false, error: fromCommandFailure(rootResult.error) }
    }
    if (rootResult.value.exitCode !== 0) {
      return { ok: false, error: { kind: "not_git_repository" } }
    }
    const root = rootResult.value.stdout.trim()
    if (root.length === 0) {
      return { ok: false, error: { kind: "not_git_repository" } }
    }

    const branchResult = await deps.runGit({
      cwd: root,
      args: ["symbolic-ref", "--short", "-q", "HEAD"],
      allowExitCodes: [0, 1],
      timeoutMs: PROBE_TIMEOUT_MS,
    })
    if (!branchResult.ok) {
      return { ok: false, error: fromCommandFailure(branchResult.error) }
    }
    const currentBranch =
      branchResult.value.exitCode === 0 ? branchResult.value.stdout.trim() || null : null

    const headResult = await deps.runGit({
      cwd: root,
      args: ["rev-parse", "HEAD"],
      allowExitCodes: [0, 128],
      timeoutMs: PROBE_TIMEOUT_MS,
    })
    if (!headResult.ok) {
      return { ok: false, error: fromCommandFailure(headResult.error) }
    }
    const headSha =
      headResult.value.exitCode === 0 ? headResult.value.stdout.trim() || ZERO_SHA : ZERO_SHA

    const originHeadResult = await deps.runGit({
      cwd: root,
      args: ["symbolic-ref", "-q", "refs/remotes/origin/HEAD"],
      allowExitCodes: [0, 1],
      timeoutMs: PROBE_TIMEOUT_MS,
    })
    if (!originHeadResult.ok) {
      return { ok: false, error: fromCommandFailure(originHeadResult.error) }
    }
    let defaultRef =
      originHeadResult.value.exitCode === 0 ? originHeadResult.value.stdout.trim() || null : null

    if (defaultRef === null) {
      for (const candidate of defaultBranchCandidates) {
        const verifyResult = await deps.runGit({
          cwd: root,
          args: ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`],
          allowExitCodes: [0, 1],
          timeoutMs: PROBE_TIMEOUT_MS,
        })
        if (!verifyResult.ok) {
          return { ok: false, error: fromCommandFailure(verifyResult.error) }
        }
        if (verifyResult.value.exitCode === 0) {
          defaultRef = candidate
          break
        }
      }
    }

    let mergeBaseSha: string | null = null
    if (defaultRef !== null && headSha !== ZERO_SHA) {
      const mergeBaseResult = await deps.runGit({
        cwd: root,
        args: ["merge-base", defaultRef, "HEAD"],
        allowExitCodes: [0, 1],
        timeoutMs: PROBE_TIMEOUT_MS,
      })
      if (!mergeBaseResult.ok) {
        return { ok: false, error: fromCommandFailure(mergeBaseResult.error) }
      }
      if (mergeBaseResult.value.exitCode === 0) {
        mergeBaseSha = mergeBaseResult.value.stdout.trim() || null
      }
    }

    return {
      ok: true,
      value: {
        root,
        currentWorktreePath: root,
        currentBranch,
        defaultBranch: defaultRef === null ? null : stripRef(defaultRef),
        headSha,
        defaultRef,
        mergeBaseSha,
      },
    }
  }
