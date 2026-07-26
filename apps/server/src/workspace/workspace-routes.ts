import {
  CreateWorkspaceBodySchema,
  ListWorkspacesQuerySchema,
  UpdateWorkspaceBodySchema,
  WorkspaceCollectionSchema,
  WorkspaceSchema,
} from "contracts/http/workspace"
import { FastifyInstance } from "fastify"
import { WorkspaceRepository } from "./workspace-repository"
import {
  buildConflictProblem,
  buildInvalidCursorProblem,
  buildNotFoundProblem,
  buildPathValidationProblem,
} from "./workspace-problems"

const sendProblem = (
  reply: { status: (code: number) => { type: (type: string) => { send: (body: unknown) => unknown } } },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

export const registerWorkspaceRoutes = (
  app: FastifyInstance,
  repository: WorkspaceRepository,
) => {
  app.post("/v1/workspaces", async (request, reply) => {
    const body = CreateWorkspaceBodySchema.parse(request.body)
    const result = repository.create({ name: body.name, path: body.path })

    if (!result.ok) {
      if (result.error.kind === "path") {
        return sendProblem(reply, 400, buildPathValidationProblem(result.error.error))
      }
      return sendProblem(reply, 409, buildConflictProblem())
    }

    return reply.status(201).send(WorkspaceSchema.parse(result.value))
  })

  app.get("/v1/workspaces", async (request, reply) => {
    const query = ListWorkspacesQuerySchema.parse(request.query)
    const result = repository.list({
      limit: query.limit,
      cursor: query.cursor,
    })

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
    const result = repository.getById({ id: workspaceId })

    if (!result.ok) {
      return sendProblem(reply, 404, buildNotFoundProblem())
    }

    return reply.status(200).send(WorkspaceSchema.parse(result.value))
  })

  app.patch("/v1/workspaces/:workspaceId", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string }
    const body = UpdateWorkspaceBodySchema.parse(request.body)
    const result = repository.updateName({ id: workspaceId, name: body.name })

    if (!result.ok) {
      return sendProblem(reply, 404, buildNotFoundProblem())
    }

    return reply.status(200).send(WorkspaceSchema.parse(result.value))
  })

  app.delete("/v1/workspaces/:workspaceId", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string }
    const result = repository.delete({ id: workspaceId })

    if (!result.ok) {
      return sendProblem(reply, 404, buildNotFoundProblem())
    }

    return reply.status(204).send()
  })
}
