import {
  SetConfigOptionBodySchema,
  SetConfigOptionParamsSchema,
  SetConfigOptionQuerySchema,
} from "contracts/http/config.options"
import { PROBLEM_TYPES, ValidationProblemSchema } from "contracts/http/error"
import {
  CreateSessionBodySchema,
  CreateSessionResponseSchema,
  DeleteSessionParamsSchema,
  DeleteSessionQuerySchema,
  ListSessionsQuerySchema,
  SessionCollectionSchema,
} from "contracts/http/session"
import { FastifyInstance } from "fastify"
import { AcpSupervisor } from "../acp/supervisor/supervisor.ports"
import { AuthBroker } from "../agent/auth/broker"
import { agentAdvertisesSessionClose, agentAdvertisesSessionList } from "./session.acp.ready"
import { makeDeleteAcpSession } from "./session.delete.acp.session.usecase"
import { makeResolveAgentGate, AgentGateError } from "./session.resolve.agent.gate.usecase"
import {
  ArchivedAcpSessionsStore,
  CommandsCache,
  EnsureSupervisorReady,
  FindAgentSettings,
  SessionCwdCache,
} from "./session.ports"
import {
  buildAcpUnavailableProblem,
  buildAgentDisabledProblem,
  buildAgentNotFoundProblem,
  buildAgentUnavailableProblem,
  buildAuthRequiredProblem,
  buildSessionNotFoundProblem,
} from "./session.problems"

const sendProblem = (
  reply: {
    status: (code: number) => {
      type: (type: string) => { send: (body: unknown) => unknown }
    }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

export type SessionRouteDeps = Readonly<{
  acpSupervisor: AcpSupervisor
  findAgentSettings: FindAgentSettings
  ensureSupervisorReady: EnsureSupervisorReady
  cwdCache: SessionCwdCache
  commandsCache: CommandsCache
  archivedAcpSessions: ArchivedAcpSessionsStore
  authBroker?: AuthBroker
}>

export const registerSessionRoutes = (app: FastifyInstance, deps: SessionRouteDeps) => {
  const resolveAgentGate = makeResolveAgentGate({
    findAgentSettings: deps.findAgentSettings,
  })
  const deleteAcpSession = makeDeleteAcpSession({
    archivedAcpSessions: deps.archivedAcpSessions,
    commandsCache: deps.commandsCache,
    ensureSupervisorReady: deps.ensureSupervisorReady,
    advertisesSessionClose: (agentId) => agentAdvertisesSessionClose(deps.acpSupervisor, agentId),
    closeAcpSession: (input) => deps.acpSupervisor.closeAcpSession(input),
  })

  const sendAgentGateProblem = (
    reply: Parameters<typeof sendProblem>[0],
    error: AgentGateError,
  ) => {
    switch (error.kind) {
      case "AGENT_NOT_FOUND":
        return sendProblem(reply, 404, buildAgentNotFoundProblem())
      case "AGENT_UNAVAILABLE":
        return sendProblem(reply, 409, buildAgentUnavailableProblem())
      case "AGENT_DISABLED":
        return sendProblem(reply, 409, buildAgentDisabledProblem())
    }
  }

  app.post("/v1/sessions", async (request, reply) => {
    const body = CreateSessionBodySchema.parse(request.body)

    const gate = await resolveAgentGate({ agentId: body.agentId })
    if (!gate.ok) {
      return sendAgentGateProblem(reply, gate.error)
    }

    const supervisorReady = await deps.ensureSupervisorReady(body.agentId)
    if (!supervisorReady.ok) {
      app.log.warn(
        { agentId: body.agentId, reason: supervisorReady.reason },
        "ACP agent start failed",
      )
      return sendProblem(reply, 409, buildAcpUnavailableProblem(supervisorReady.reason))
    }

    if (!agentAdvertisesSessionList(deps.acpSupervisor, body.agentId)) {
      return sendProblem(
        reply,
        409,
        buildAcpUnavailableProblem("Agent does not support session/list"),
      )
    }

    const acpResult = await deps.acpSupervisor.createSession({
      agentId: body.agentId,
      cwd: body.cwd,
    })

    if (!acpResult.ok) {
      if (acpResult.authRequired === true && deps.authBroker !== undefined) {
        await deps.authBroker.ensureSessionFromChallenge(body.agentId)
        return sendProblem(reply, 409, buildAuthRequiredProblem())
      }
      return sendProblem(reply, 409, buildAcpUnavailableProblem(acpResult.reason))
    }

    deps.cwdCache.remember({
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
        configOptions: acpResult.configOptions,
      }),
    )
  })

  app.get("/v1/sessions", async (request, reply) => {
    const query = ListSessionsQuerySchema.parse(request.query)
    const listed = await deps.acpSupervisor.listAcpSessions(
      query.cwd === undefined ? undefined : { cwd: query.cwd },
    )

    if (!listed.ok) {
      app.log.warn(
        {
          reason: listed.reason,
          agentIds: [...deps.acpSupervisor.getRunningAgentIds()],
        },
        "ACP session/list failed",
      )
      return sendProblem(reply, 409, buildAcpUnavailableProblem(listed.reason))
    }

    const visible = listed.sessions.filter(
      (session) =>
        !deps.archivedAcpSessions.isArchived({
          agentId: session.agentId,
          sessionId: session.sessionId,
        }),
    )

    visible.forEach((session) => {
      deps.cwdCache.remember({
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

  app.put("/v1/sessions/:sessionId/config-options/:configId", async (request, reply) => {
    const params = SetConfigOptionParamsSchema.parse(request.params)
    const body = SetConfigOptionBodySchema.parse(request.body)
    const query = SetConfigOptionQuerySchema.parse(request.query)

    const gate = await resolveAgentGate({ agentId: query.agentId })
    if (!gate.ok) {
      return sendAgentGateProblem(reply, gate.error)
    }

    const supervisorReady = await deps.ensureSupervisorReady(query.agentId)
    if (!supervisorReady.ok) {
      app.log.warn(
        { agentId: query.agentId, reason: supervisorReady.reason },
        "ACP agent start failed",
      )
      return sendProblem(reply, 409, buildAcpUnavailableProblem(supervisorReady.reason))
    }

    if (deps.cwdCache.get({ agentId: query.agentId, sessionId: params.sessionId }) === undefined) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    const result = await deps.acpSupervisor.setConfigOption({
      agentId: query.agentId,
      sessionId: params.sessionId,
      configId: params.configId,
      value: body.value,
    })

    if (!result.ok) {
      if (result.kind === "unknown-session") {
        return sendProblem(reply, 404, buildSessionNotFoundProblem(result.reason))
      }
      if (result.kind === "invalid-option") {
        return sendProblem(
          reply,
          422,
          ValidationProblemSchema.parse({
            type: PROBLEM_TYPES.validationError,
            title: "Config option rejected",
            status: 422,
            code: "validation.configOption.invalid",
            errors: [{ pointer: "#/value", code: "validation.configOption.invalid" }],
          }),
        )
      }
      return sendProblem(reply, 409, buildAcpUnavailableProblem(result.reason))
    }

    return reply.status(202).send()
  })

  app.delete("/v1/sessions/:sessionId", async (request, reply) => {
    const params = DeleteSessionParamsSchema.parse(request.params)
    const query = DeleteSessionQuerySchema.parse(request.query)

    const gate = await resolveAgentGate({ agentId: query.agentId })
    if (!gate.ok) {
      return sendAgentGateProblem(reply, gate.error)
    }

    const result = await deleteAcpSession({
      agentId: query.agentId,
      sessionId: params.sessionId,
    })

    if (!result.ok) {
      return sendProblem(reply, 409, buildAcpUnavailableProblem(result.reason))
    }

    return reply.status(204).send()
  })
}
