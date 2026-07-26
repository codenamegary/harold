import {
  AgentIdSchema,
  AgentSettingsCollectionSchema,
  AgentSettingsSchema,
  UpdateAgentSettingsBodySchema,
} from "contracts/http/agent-settings"
import { FastifyInstance } from "fastify"
import { AgentSettingsRepository } from "./agent-settings-repository"
import {
  buildAgentCannotEnableProblem,
  buildAgentNotFoundProblem,
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
) => {
  app.get("/v1/settings/agents", async (_request, reply) => {
    const collection = AgentSettingsCollectionSchema.parse({
      items: repository.list(),
    })

    return reply.status(200).send(collection)
  })

  app.patch("/v1/settings/agents/:agentId", async (request, reply) => {
    const agentId = AgentIdSchema.parse((request.params as { agentId: string }).agentId)
    const body = UpdateAgentSettingsBodySchema.parse(request.body)
    const result = repository.update({ agentId, body })

    if (!result.ok) {
      if (result.error.kind === "cannot_enable") {
        return sendProblem(reply, 409, buildAgentCannotEnableProblem())
      }
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    return reply.status(200).send(AgentSettingsSchema.parse(result.value))
  })
}
