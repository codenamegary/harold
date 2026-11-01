import {
  GIT_CHANGES_PATH,
  GIT_FILE_PATH,
  GIT_SUMMARY_PATH,
  GIT_WORKTREES_PATH,
  GitChangesQuerySchema,
  GitChangesSchema,
  GitFileDiffSchema,
  GitFileQuerySchema,
  GitPathQuerySchema,
  GitSummarySchema,
  GitWorktreeCollectionSchema,
} from "contracts/http/git"
import { GetGitChanges } from "core/git/changes.usecase"
import { GitOperationError } from "core/git/errors"
import { GetGitFileDiff } from "core/git/file.diff.usecase"
import { GetGitSummary } from "core/git/summary.usecase"
import { ListGitWorktrees } from "core/git/worktrees.usecase"
import { FastifyInstance } from "fastify"
import { sendProblem } from "../error/send.problem"
import { gitErrorToProblem } from "./git.problems"

export type GitRoutesDeps = Readonly<{
  getSummary: GetGitSummary
  listWorktrees: ListGitWorktrees
  getChanges: GetGitChanges
  getFileDiff: GetGitFileDiff
}>

const sendGitError = (reply: Parameters<typeof sendProblem>[0], error: GitOperationError) => {
  const problem = gitErrorToProblem(error)
  return sendProblem(reply, problem.status, problem.body)
}

export const registerGitRoutes = (app: FastifyInstance, deps: GitRoutesDeps) => {
  app.get(GIT_SUMMARY_PATH, async (request, reply) => {
    const query = GitPathQuerySchema.parse(request.query)
    const result = await deps.getSummary({ path: query.path })
    if (!result.ok) {
      return sendGitError(reply, result.error)
    }
    return reply.status(200).send(GitSummarySchema.parse(result.value))
  })

  app.get(GIT_WORKTREES_PATH, async (request, reply) => {
    const query = GitPathQuerySchema.parse(request.query)
    const result = await deps.listWorktrees({ path: query.path })
    if (!result.ok) {
      return sendGitError(reply, result.error)
    }
    return reply.status(200).send(GitWorktreeCollectionSchema.parse(result.value))
  })

  app.get(GIT_CHANGES_PATH, async (request, reply) => {
    const query = GitChangesQuerySchema.parse(request.query)
    const result = await deps.getChanges({ path: query.path, scope: query.scope })
    if (!result.ok) {
      return sendGitError(reply, result.error)
    }
    return reply.status(200).send(GitChangesSchema.parse(result.value))
  })

  app.get(GIT_FILE_PATH, async (request, reply) => {
    const query = GitFileQuerySchema.parse(request.query)
    const result = await deps.getFileDiff({
      path: query.path,
      scope: query.scope,
      file: query.file,
      ...(query.oldPath === undefined ? {} : { oldPath: query.oldPath }),
    })
    if (!result.ok) {
      return sendGitError(reply, result.error)
    }
    return reply.status(200).send(GitFileDiffSchema.parse(result.value))
  })
}
