import { GitSummary } from "contracts/http/git"
import { GitOperationResult } from "./git.errors"
import { ResolveRepository } from "./git.resolve.repository.usecase"
import { readStatusEntries } from "./git.status"
import { RunGit } from "./git.ports"

export type GetGitSummaryDeps = Readonly<{
  resolveRepository: ResolveRepository
  runGit: RunGit
}>

export type GetGitSummary = (params: { path: string }) => Promise<GitOperationResult<GitSummary>>

export const makeGetGitSummary =
  (deps: GetGitSummaryDeps): GetGitSummary =>
  async ({ path }) => {
    const repositoryResult = await deps.resolveRepository({ path })
    if (!repositoryResult.ok) {
      return repositoryResult
    }
    const repository = repositoryResult.value
    const status = await readStatusEntries(deps.runGit, repository.root)
    if (!status.ok) {
      return { ok: false, error: status.error }
    }
    return {
      ok: true,
      value: {
        repository: {
          root: repository.root,
          currentWorktreePath: repository.root,
          currentBranch: repository.currentBranch,
          defaultBranch: repository.defaultBranch,
          headSha: repository.headSha,
        },
        uncommittedFileCount: status.entries.length,
      },
    }
  }
