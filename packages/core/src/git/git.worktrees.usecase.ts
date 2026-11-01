import { GitWorktree, GitWorktreeCollection } from "contracts/http/git"
import { mapWithConcurrency } from "./git.concurrency"
import { GitOperationResult } from "./git.errors"
import { fromGitCommandFailure } from "./git.errors"
import { ResolveRepository } from "./git.resolve.repository.usecase"
import { parseWorktreeList } from "./git.parsers"
import { readStatusEntries } from "./git.status"
import { RunGit } from "./git.ports"

const READ_TIMEOUT_MS = 10_000
const MAX_WORKTREES = 50
const DIRTY_COUNT_CONCURRENCY = 4

export type ListGitWorktreesDeps = Readonly<{
  resolveRepository: ResolveRepository
  runGit: RunGit
}>

export type ListGitWorktrees = (params: {
  path: string
}) => Promise<GitOperationResult<GitWorktreeCollection>>

export const makeListGitWorktrees =
  (deps: ListGitWorktreesDeps): ListGitWorktrees =>
  async ({ path }) => {
    const repositoryResult = await deps.resolveRepository({ path })
    if (!repositoryResult.ok) {
      return repositoryResult
    }
    const repository = repositoryResult.value

    const listResult = await deps.runGit({
      cwd: repository.root,
      args: ["worktree", "list", "--porcelain", "-z"],
      allowExitCodes: [0],
      timeoutMs: READ_TIMEOUT_MS,
    })
    if (!listResult.ok) {
      return { ok: false, error: fromGitCommandFailure(listResult.error) }
    }
    if (listResult.value.exitCode !== 0) {
      return {
        ok: false,
        error: {
          kind: "git_failed",
          detail: listResult.value.stderr.trim() || "git worktree list failed",
        },
      }
    }

    const parsed = parseWorktreeList(listResult.value.stdout)
      .filter((worktree) => !worktree.prunable && !worktree.bare)
      .slice(0, MAX_WORKTREES)

    const dirtyCounts = await mapWithConcurrency(
      parsed,
      DIRTY_COUNT_CONCURRENCY,
      async (worktree) => {
        const status = await readStatusEntries(deps.runGit, worktree.path)
        return status.ok ? status.entries.length : null
      },
    )

    const items: GitWorktree[] = parsed.map((worktree, index) => ({
      path: worktree.path,
      branch: worktree.branch,
      headSha: worktree.headSha,
      isCurrent: worktree.path === repository.root,
      isMain: index === 0,
      dirtyFileCount: dirtyCounts[index] ?? null,
    }))

    return { ok: true, value: { items } }
  }
