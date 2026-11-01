import { CanonicalizePath } from "core/filesystem/ports"
import { makeGetGitChanges } from "core/git/changes.usecase"
import { makeGetGitFileDiff } from "core/git/file.diff.usecase"
import { RunGit } from "core/git/ports"
import { makeResolveRepository } from "core/git/resolve.repository.usecase"
import { makeGetGitSummary } from "core/git/summary.usecase"
import { makeListGitWorktrees } from "core/git/worktrees.usecase"
import { FastifyInstance } from "fastify"
import { makeRunGit } from "./git.node.adapters"
import { registerGitRoutes } from "./git.routes"

export type AssembleGitSliceDeps = Readonly<{
  canonicalizePath: CanonicalizePath
  runGit?: RunGit
}>

export type GitSlice = Readonly<{
  registerRoutes: (app: FastifyInstance) => void
}>

export const assembleGitSlice = (deps: AssembleGitSliceDeps): GitSlice => {
  const runGit = deps.runGit ?? makeRunGit()
  const resolveRepository = makeResolveRepository({
    canonicalizePath: deps.canonicalizePath,
    runGit,
  })
  const getSummary = makeGetGitSummary({ resolveRepository, runGit })
  const listWorktrees = makeListGitWorktrees({ resolveRepository, runGit })
  const getChanges = makeGetGitChanges({ resolveRepository, runGit })
  const getFileDiff = makeGetGitFileDiff({ resolveRepository, getChanges, runGit })

  return {
    registerRoutes: (app) => {
      registerGitRoutes(app, {
        getSummary,
        listWorktrees,
        getChanges,
        getFileDiff,
      })
    },
  }
}
