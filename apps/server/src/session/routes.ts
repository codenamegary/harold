import {
  CreateSessionBodySchema,
  CreateSessionResponseSchema,
  DeleteSessionQuerySchema,
  ListSessionsQuerySchema,
  SessionCollectionSchema,
} from "contracts/http/session"
import { FastifyInstance } from "fastify"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { AgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { SessionCwdCache } from "./hub/session.hub"
import { ArchivedAcpSessionsStore } from "./archived.acp.sessions.store"
import { ensureSupervisorReady } from "./session.acp.ready"
import {
  buildAcpUnavailableProblem,
  buildAgentDisabledProblem,
  buildAgentNotFoundProblem,
  buildAgentUnavailableProblem,
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

export const registerSessionRoutes = (
  app: FastifyInstance,
  agentSettingsRepository: AgentSettingsRepository,
  acpSupervisor: AcpSupervisor,
  cwdCache: SessionCwdCache,
  archivedAcpSessions: ArchivedAcpSessionsStore,
) => {
  app.post("/v1/sessions", async (request, reply) => {
    const body = CreateSessionBodySchema.parse(request.body)

    const agentSettings = agentSettingsRepository
      .list()
      .find((settings) => settings.id === body.agentId)

    if (agentSettings === undefined) {
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    if (!agentSettings.available) {
      return sendProblem(reply, 409, buildAgentUnavailableProblem())
    }

    if (!agentSettings.enabled) {
      return sendProblem(reply, 409, buildAgentDisabledProblem())
    }

    const supervisorReady = await ensureSupervisorReady(acpSupervisor, body.agentId)
    if (!supervisorReady) {
      return sendProblem(reply, 409, buildAcpUnavailableProblem())
    }

    if (!acpSupervisor.getAgentCapabilities(body.agentId)?.sessionCapabilities.list) {
      return sendProblem(
        reply,
        409,
        buildAcpUnavailableProblem("Agent does not support session/list"),
      )
    }

    const acpResult = await acpSupervisor.createSession({
      agentId: body.agentId,
      cwd: body.cwd,
    })

    if (!acpResult.ok) {
      return sendProblem(reply, 409, buildAcpUnavailableProblem(acpResult.reason))
    }

    cwdCache.remember({
      agentId: body.agentId,
      sessionId: acpResult.acpSessionId,
      cwd: body.cwd,
    })

    const updatedAt = new Date().toISOString()
    return reply.status(201).send(
      CreateSessionResponseSchema.parse({
        agentId: body.agentId,
        sessionId: acpResult.acpSessionId,
        cwd: body.cwd,
        title: acpResult.acpSessionId,
        updatedAt,
      }),
    )
  })

  app.get("/v1/sessions", async (request, reply) => {
    const query = ListSessionsQuerySchema.parse(request.query)
    const listed = await acpSupervisor.listAcpSessions(
      query.cwd === undefined ? undefined : { cwd: query.cwd },
    )

    if (!listed.ok) {
      return sendProblem(reply, 409, buildAcpUnavailableProblem(listed.reason))
    }

    const visible = listed.sessions.filter(
      (session) =>
        !archivedAcpSessions.isArchived({
          agentId: session.agentId,
          sessionId: session.sessionId,
        }),
    )

    visible.forEach((session) => {
      cwdCache.remember({
        agentId: session.agentId,
        sessionId: session.sessionId,
        cwd: session.cwd,
      })
    })

    return reply.status(200).send(
      SessionCollectionSchema.parse({
        items: visible,
      }),
    )
  })

  app.delete("/v1/sessions/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const query = DeleteSessionQuerySchema.parse(request.query)

    const agentSettings = agentSettingsRepository
      .list()
      .find((settings) => settings.id === query.agentId)

    if (agentSettings === undefined) {
      return sendProblem(reply, 404, buildAgentNotFoundProblem())
    }

    if (!agentSettings.available) {
      return sendProblem(reply, 409, buildAgentUnavailableProblem())
    }

    if (!agentSettings.enabled) {
      return sendProblem(reply, 409, buildAgentDisabledProblem())
    }

    archivedAcpSessions.archive({
      agentId: query.agentId,
      sessionId,
    })

    const supervisorReady = await ensureSupervisorReady(acpSupervisor, query.agentId)
    if (
      supervisorReady &&
      acpSupervisor.getAgentCapabilities(query.agentId)?.sessionCapabilities.close
    ) {
      await acpSupervisor.closeAcpSession({
        agentId: query.agentId,
        sessionId,
      })
    }

    return reply.status(204).send()
  })
}
