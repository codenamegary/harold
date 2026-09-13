import { SetConfigOptionBodySchema } from "contracts/http/config-options"
import {
  PROBLEM_TYPES,
  ValidationProblemSchema,
} from "contracts/http/error"
import {
  CreateSessionBodySchema,
  CreateSessionResponseSchema,
  DeleteSessionQuerySchema,
  ListSessionsQuerySchema,
  SessionCollectionSchema,
} from "contracts/http/session"
import { FastifyInstance } from "fastify"
import { AcpSupervisor } from "../acp/supervisor/models"
import { AuthBroker } from "../agent/auth/broker"
import { AgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { CommandsCache } from "./hub/commands.cache"
import { SessionCwdCache } from "./hub/hub"
import { ArchivedAcpSessionsStore } from "./archived.acp.sessions.store"
import { SetConfigOptionQuerySchema } from "./config-options.query"
import { deleteAcpSession } from "./delete.acp.session"
import { ensureSupervisorReady, agentAdvertisesSessionList } from "./session.acp.ready"
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

export const registerSessionRoutes = (
  app: FastifyInstance,
  agentSettingsRepository: AgentSettingsRepository,
  acpSupervisor: AcpSupervisor,
  cwdCache: SessionCwdCache,
  commandsCache: CommandsCache,
  archivedAcpSessions: ArchivedAcpSessionsStore,
  authBroker?: AuthBroker,
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
    if (!supervisorReady.ok) {
      app.log.warn(
        { agentId: body.agentId, reason: supervisorReady.reason },
        "ACP agent start failed",
      )
      return sendProblem(reply, 409, buildAcpUnavailableProblem(supervisorReady.reason))
    }

    if (!agentAdvertisesSessionList(acpSupervisor, body.agentId)) {
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
      if (acpResult.authRequired === true && authBroker !== undefined) {
        await authBroker.ensureSessionFromChallenge(body.agentId)
        return sendProblem(reply, 409, buildAuthRequiredProblem())
      }
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
      app.log.warn(
        {
          reason: listed.reason,
          agentIds: [...acpSupervisor.getRunningAgentIds()],
        },
        "ACP session/list failed",
      )
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

  app.put("/v1/sessions/:sessionId/config-options/:configId", async (request, reply) => {
    const { sessionId, configId } = request.params as {
      sessionId: string
      configId: string
    }
    const body = SetConfigOptionBodySchema.parse(request.body)
    const query = SetConfigOptionQuerySchema.parse(request.query)

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

    const supervisorReady = await ensureSupervisorReady(acpSupervisor, query.agentId)
    if (!supervisorReady.ok) {
      app.log.warn(
        { agentId: query.agentId, reason: supervisorReady.reason },
        "ACP agent start failed",
      )
      return sendProblem(reply, 409, buildAcpUnavailableProblem(supervisorReady.reason))
    }

    if (cwdCache.get({ agentId: query.agentId, sessionId }) === undefined) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    const result = await acpSupervisor.setConfigOption({
      agentId: query.agentId,
      sessionId,
      configId,
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
    const { sessionId } = request.params as { sessionId: string }
    const query = DeleteSessionQuerySchema.parse(request.query)

    const result = await deleteAcpSession({
      agentId: query.agentId,
      sessionId,
      agentSettingsRepository,
      acpSupervisor,
      archivedAcpSessions,
      commandsCache,
    })

    if (!result.ok) {
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

      return sendProblem(reply, 409, buildAcpUnavailableProblem(result.reason))
    }

    return reply.status(204).send()
  })
}
