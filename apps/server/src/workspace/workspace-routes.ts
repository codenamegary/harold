import {
  CreateWorkspaceBodySchema,
  DeleteWorkspaceQuerySchema,
  ListWorkspacesQuerySchema,
  UpdateWorkspaceBodySchema,
  WorkspaceCollectionSchema,
  WorkspaceSchema,
} from "contracts/http/workspace"
import { FastifyInstance } from "fastify"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { SessionRepository } from "../session/session-repository"
import { WorkspaceRepository } from "./workspace-repository"
import { WorkspaceService } from "./service"
import {
  buildConflictProblem,
  buildInvalidCursorProblem,
  buildNotFoundProblem,
  buildPathValidationProblem,
  buildWorkspaceActiveSessionsProblem,
} from "./workspace-problems"

const sendProblem = (
  reply: { status: (code: number) => { type: (type: string) => { send: (body: unknown) => unknown } } },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

export const registerWorkspaceRoutes = (
  app: FastifyInstance,
  repository: WorkspaceRepository,
  workspaceService: WorkspaceService,
  sessionRepository: SessionRepository,
  acpSupervisor: AcpSupervisor,
) => {
  app.post("/v1/workspaces", async (request, reply) => {
    const body = CreateWorkspaceBodySchema.parse(request.body)
    const result = workspaceService.create(body)

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
    const result = repository.list(query)

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
    const result = workspaceService.updateName({ id: workspaceId, ...body })

    if (!result.ok) {
      return sendProblem(reply, 404, buildNotFoundProblem())
    }

    return reply.status(200).send(WorkspaceSchema.parse(result.value))
  })

  app.delete("/v1/workspaces/:workspaceId", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string }
    const query = DeleteWorkspaceQuerySchema.parse(request.query)
    const force = query.force ?? false

    const workspace = repository.getById({ id: workspaceId })
    if (!workspace.ok) {
      return sendProblem(reply, 404, buildNotFoundProblem())
    }

    const liveSessions = sessionRepository.listLiveByWorkspace({ workspaceId })
    const closeResult = await acpSupervisor.closeWorkspaceSessions({
      sessions: liveSessions.map((session) => ({
        acpSessionId: session.acpSessionId,
        agentId: session.agentId,
      })),
    })

    if (closeResult.failures.length > 0 && !force) {
      const detail = closeResult.failures.map((failure) => failure.reason).join("; ")
      return sendProblem(reply, 409, buildWorkspaceActiveSessionsProblem(detail))
    }

    if (closeResult.failures.length > 0) {
      acpSupervisor.unbindWorkspaceSessions({
        sessions: closeResult.failures.map((failure) => ({
          acpSessionId: failure.acpSessionId,
          agentId:
            liveSessions.find((session) => session.acpSessionId === failure.acpSessionId)?.agentId ??
            "cursor",
        })),
      })
    }

    const result = workspaceService.delete({ id: workspaceId })

    if (!result.ok) {
      return sendProblem(reply, 404, buildNotFoundProblem())
    }

    return reply.status(204).send()
  })
}
