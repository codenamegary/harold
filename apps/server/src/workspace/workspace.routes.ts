import {
  CreateWorkspaceBody,
  CreateWorkspaceBodySchema,
  DeleteWorkspaceQuerySchema,
  ListWorkspacesQuerySchema,
  UpdateWorkspaceBodySchema,
  WorkspaceCollectionSchema,
  WorkspaceSchema,
} from "contracts/http/workspace"
import { FastifyInstance } from "fastify"
import { RegisterWorkspaceResult } from "core/workspace/register.usecase"
import {
  DeleteWorkspace,
  FindWorkspaceById,
  ListWorkspaces,
  UpdateWorkspaceName,
} from "core/workspace/ports"
import {
  buildCloneFailedProblem,
  buildDestinationNotEmptyProblem,
  buildInvalidCursorProblem,
  buildInvalidGitUrlProblem,
  buildNotFoundProblem,
  buildPathValidationProblem,
  buildWorkspaceActiveSessionsProblem,
  buildWorkspaceConflictProblem,
} from "./workspace.problems"

const sendProblem = (
  reply: {
    status: (code: number) => { type: (type: string) => { send: (body: unknown) => unknown } }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

export type WorkspaceRouteDeps = Readonly<{
  registerWorkspace: (body: CreateWorkspaceBody) => Promise<RegisterWorkspaceResult>
  listWorkspaces: ListWorkspaces
  findWorkspaceById: FindWorkspaceById
  updateWorkspaceName: UpdateWorkspaceName
  deleteWorkspace: DeleteWorkspace
}>

export const registerWorkspaceRoutes = (app: FastifyInstance, deps: WorkspaceRouteDeps) => {
  app.post("/v1/workspaces", async (request, reply) => {
    const body = CreateWorkspaceBodySchema.parse(request.body)
    const result = await deps.registerWorkspace(body)

    if (!result.ok) {
      switch (result.error.kind) {
        case "path":
          return sendProblem(reply, 400, buildPathValidationProblem(result.error.error))
        case "invalid_git_url":
          return sendProblem(reply, 400, buildInvalidGitUrlProblem())
        case "destination_not_empty":
          return sendProblem(reply, 409, buildDestinationNotEmptyProblem())
        case "clone_failed":
          return sendProblem(reply, 422, buildCloneFailedProblem(result.error.detail))
        case "not_found":
        case "duplicate_path":
          return sendProblem(reply, 409, buildWorkspaceConflictProblem())
      }
    }

    const status = result.created ? 201 : 200
    return reply.status(status).send(WorkspaceSchema.parse(result.value))
  })

  app.get("/v1/workspaces", async (request, reply) => {
    const query = ListWorkspacesQuerySchema.parse(request.query)
    const result = deps.listWorkspaces(query)

    if (!result.ok) {
      return sendProblem(reply, 400, buildInvalidCursorProblem())
    }

    const collection = WorkspaceCollectionSchema.parse({
      items: result.value.items,
      page: {
        limit: result.value.limit,
        nextCursor: result.value.nextCursor,
        previousCursor: result.value.previousCursor,
        count: result.value.count,
      },
    })

    return reply.status(200).send(collection)
  })

  app.get("/v1/workspaces/:workspaceId", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string }
    const result = deps.findWorkspaceById({ id: workspaceId })

    if (!result.ok) {
      return sendProblem(reply, 404, buildNotFoundProblem())
    }

    return reply.status(200).send(WorkspaceSchema.parse(result.value))
  })

  app.patch("/v1/workspaces/:workspaceId", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string }
    const body = UpdateWorkspaceBodySchema.parse(request.body)
    const result = deps.updateWorkspaceName({ id: workspaceId, name: body.name })

    if (!result.ok) {
      return sendProblem(reply, 404, buildNotFoundProblem())
    }

    return reply.status(200).send(WorkspaceSchema.parse(result.value))
  })

  app.delete("/v1/workspaces/:workspaceId", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string }
    const query = DeleteWorkspaceQuerySchema.parse(request.query)
    const force = query.force ?? false

    const deleted = await deps.deleteWorkspace({
      workspaceId,
      force,
    })

    if (!deleted.ok) {
      if (deleted.error.kind === "active_sessions") {
        return sendProblem(reply, 409, buildWorkspaceActiveSessionsProblem(deleted.error.detail))
      }
      return sendProblem(reply, 404, buildNotFoundProblem())
    }

    return reply.status(204).send()
  })
}
