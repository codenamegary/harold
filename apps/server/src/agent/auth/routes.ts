import {
  AgentAuthSchema,
  AgentAuthSessionSchema,
  AgentAuthSummarySchema,
  agentAuthLogoutPath,
  agentAuthPath,
  agentAuthSessionActionsPath,
  agentAuthSessionsPath,
  AgentAuthSessionActionBodySchema,
  StartAgentAuthSessionBodySchema,
} from "contracts/http/agent-auth"
import { AgentId, AgentIdSchema } from "contracts/http/agent-settings"
import { FastifyInstance } from "fastify"
import { AuthBroker } from "./broker"
import { problemForAuthBrokerError } from "./problems"

const sendProblem = (
  reply: {
    status: (code: number) => {
      type: (type: string) => { send: (body: unknown) => unknown }
    }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

export const registerAgentAuthRoutes = (
  app: FastifyInstance,
  broker: AuthBroker,
  agentExists: (agentId: AgentId) => boolean,
) => {
  app.get(agentAuthPath(":agentId"), async (request, reply) => {
    const agentId = AgentIdSchema.parse((request.params as { agentId: string }).agentId)
    if (!agentExists(agentId)) {
      const mapped = problemForAuthBrokerError({ kind: "agent_not_found" })
      return sendProblem(reply, mapped.status, mapped.problem)
    }
    const auth = await broker.get(agentId)
    return reply.status(200).send(AgentAuthSchema.parse(auth))
  })

  app.post(agentAuthSessionsPath(":agentId"), async (request, reply) => {
    const agentId = AgentIdSchema.parse((request.params as { agentId: string }).agentId)
    StartAgentAuthSessionBodySchema.parse(request.body ?? {})
    const result = await broker.startSession({ agentId })
    if (!result.ok) {
      const mapped = problemForAuthBrokerError(result.error)
      return sendProblem(reply, mapped.status, mapped.problem)
    }
    return reply.status(201).send(AgentAuthSessionSchema.parse(result.value))
  })

  app.post(
    agentAuthSessionActionsPath(":agentId", ":sessionId"),
    async (request, reply) => {
      const params = request.params as { agentId: string; sessionId: string }
      const agentId = AgentIdSchema.parse(params.agentId)
      const sessionId = params.sessionId
      const action = AgentAuthSessionActionBodySchema.parse(request.body)
      const result = await broker.applyAction({ agentId, sessionId, action })
      if (!result.ok) {
        const mapped = problemForAuthBrokerError(result.error)
        return sendProblem(reply, mapped.status, mapped.problem)
      }
      return reply.status(200).send(AgentAuthSessionSchema.parse(result.value))
    },
  )

  app.post(agentAuthLogoutPath(":agentId"), async (request, reply) => {
    const agentId = AgentIdSchema.parse((request.params as { agentId: string }).agentId)
    const result = await broker.logout(agentId)
    if (!result.ok) {
      const mapped = problemForAuthBrokerError(result.error)
      return sendProblem(reply, mapped.status, mapped.problem)
    }
    return reply.status(200).send(AgentAuthSummarySchema.parse(result.value))
  })
}
