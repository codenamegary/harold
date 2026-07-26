import { AgentId } from "contracts/http/agent-settings"
import { CreateSessionBodySchema, SessionSchema } from "contracts/http/session"
import { FastifyInstance } from "fastify"
import { AgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { agentDefinitions } from "../agent-settings/agent-registry"
import { WorkspaceRepository } from "../workspace/workspace-repository"
import { SessionRepository } from "./session-repository"
import {
  buildAgentDisabledProblem,
  buildAgentNotFoundProblem,
  buildAgentUnavailableProblem,
  buildWorkspaceNotFoundProblem,
} from "./session-problems"

const sendProblem = (
  reply: {
    status: (code: number) => {
      type: (type: string) => { send: (body: unknown) => unknown }
    }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

const isRegisteredAgent = (agentId: AgentId): boolean => agentId in agentDefinitions

export const registerSessionRoutes = (
  app: FastifyInstance,
  sessionRepository: SessionRepository,
  workspaceRepository: WorkspaceRepository,
  agentSettingsRepository: AgentSettingsRepository,
) => {
  app.post("/v1/sessions", async (request, reply) => {
    const body = CreateSessionBodySchema.parse(request.body)

    const workspace = workspaceRepository.getById({ id: body.workspaceId })
    if (!workspace.ok) {
      return sendProblem(reply, 404, buildWorkspaceNotFoundProblem())
    }

    if (!isRegisteredAgent(body.agentId)) {
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    const definition = agentDefinitions[body.agentId]
    if (!definition.available) {
      return sendProblem(reply, 409, buildAgentUnavailableProblem())
    }

    const agentSettings = agentSettingsRepository
      .list()
      .find((settings) => settings.id === body.agentId)

    if (agentSettings === undefined || !agentSettings.enabled) {
      return sendProblem(reply, 409, buildAgentDisabledProblem())
    }

    const result = sessionRepository.create({
      workspaceId: body.workspaceId,
      agentId: body.agentId,
      name: body.name,
      acpSessionId: "pending",
      state: "starting",
    })

    if (!result.ok) {
      throw new Error("session create failed unexpectedly")
    }

    return reply.status(201).send(SessionSchema.parse(result.value))
  })
}
