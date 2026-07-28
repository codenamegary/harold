import {
  AgentIdSchema,
  AgentSettingsCollectionSchema,
  AgentSettingsSchema,
  DetectAgentPathResponseSchema,
  UpdateAgentSettingsBodySchema,
} from "contracts/http/agent-settings"
import { FastifyInstance } from "fastify"
import { AcpSupervisor } from "../acp/acp-supervisor-types"
import { AgentSettingsRepository } from "./agent-settings-repository"
import {
  buildAgentCannotEnableProblem,
  buildAgentNotFoundProblem,
  buildAgentPathAutoDetectFailedProblem,
  buildAgentPathInvalidProblem,
  buildAgentPathNotFoundProblem,
} from "./agent-settings-problems"

const sendProblem = (
  reply: {
    status: (code: number) => {
      type: (type: string) => { send: (body: unknown) => unknown }
    }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

export const registerAgentSettingsRoutes = (
  app: FastifyInstance,
  repository: AgentSettingsRepository,
  acpSupervisor: AcpSupervisor,
) => {
  app.get("/v1/settings/agents", async (_request, reply) => {
    const collection = AgentSettingsCollectionSchema.parse({
      items: repository.list(),
    })

    return reply.status(200).send(collection)
  })

  app.post("/v1/settings/agents/:agentId/detect-path", async (request, reply) => {
    const agentId = AgentIdSchema.parse((request.params as { agentId: string }).agentId)
    const result = repository.detectPath(agentId)

    if (!result.ok) {
      if (result.error.kind === "path_not_found") {
        return sendProblem(reply, 404, buildAgentPathNotFoundProblem())
      }
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    return reply.status(200).send(
      DetectAgentPathResponseSchema.parse(result.value),
    )
  })

  app.patch("/v1/settings/agents/:agentId", async (request, reply) => {
    const agentId = AgentIdSchema.parse((request.params as { agentId: string }).agentId)
    const body = UpdateAgentSettingsBodySchema.parse(request.body)
    const result = repository.update({ agentId, body })

    if (!result.ok) {
      if (result.error.kind === "cannot_enable") {
        return sendProblem(reply, 409, buildAgentCannotEnableProblem())
      }
      if (result.error.kind === "path_not_found") {
        return sendProblem(reply, 404, buildAgentPathNotFoundProblem())
      }
      if (result.error.kind === "path_auto_detect_failed") {
        return sendProblem(reply, 400, buildAgentPathAutoDetectFailedProblem())
      }
      if (result.error.kind === "path_invalid") {
        return sendProblem(reply, 400, buildAgentPathInvalidProblem(result.error.path))
      }
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    if (!body.enabled) {
      await acpSupervisor.handleAgentDisabled(agentId)
    }

    return reply.status(200).send(AgentSettingsSchema.parse(result.value))
  })
}
