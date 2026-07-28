import { AgentId } from "contracts/http/agent-settings"
import {
  CreateSessionBodySchema,
  ListSessionsQuerySchema,
  SessionCollectionSchema,
  SessionSchema,
  UpdateSessionBodySchema,
} from "contracts/http/session"
import { FastifyInstance } from "fastify"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { AgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { agentDefinitions } from "../agent-settings/agent-registry"
import { WorkspaceRepository } from "../workspace/workspace-repository"
import { SessionRepository } from "./session-repository"
import {
  buildAcpUnavailableProblem,
  buildAgentDisabledProblem,
  buildAgentNotFoundProblem,
  buildAgentUnavailableProblem,
  buildInvalidCursorProblem,
  buildSessionArchivedProblem,
  buildSessionNotFoundProblem,
  buildSessionNotResumableProblem,
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

const isArchivedSession = (session: { archivedAt: string | null; state: string }): boolean =>
  session.archivedAt !== null || session.state === "archived"

const ensureSupervisorReady = async (
  acpSupervisor: AcpSupervisor,
  agentId: AgentId,
): Promise<boolean> => {
  const runningAgentId = acpSupervisor.getRunningAgentId()
  const status = acpSupervisor.getStatus()

  if (status.state === "ready" && runningAgentId === agentId) {
    return true
  }

  try {
    await acpSupervisor.start(agentId)
    return acpSupervisor.getStatus().state === "ready"
  } catch {
    return false
  }
}

const agentAdvertisesResumable = (acpSupervisor: AcpSupervisor): boolean =>
  acpSupervisor.getAgentCapabilities()?.loadSession === true

export const registerSessionRoutes = (
  app: FastifyInstance,
  sessionRepository: SessionRepository,
  workspaceRepository: WorkspaceRepository,
  agentSettingsRepository: AgentSettingsRepository,
  acpSupervisor: AcpSupervisor,
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

    const created = sessionRepository.create({
      workspaceId: body.workspaceId,
      agentId: body.agentId,
      name: body.name,
      acpSessionId: "pending",
      state: "starting",
    })

    if (!created.ok) {
      throw new Error("session create failed unexpectedly")
    }

    const supervisorReady = await ensureSupervisorReady(acpSupervisor, body.agentId)
    if (!supervisorReady) {
      sessionRepository.markError({ id: created.value.id })
      return sendProblem(reply, 409, buildAcpUnavailableProblem())
    }

    const acpResult = await acpSupervisor.createAcpSession({
      workspaceCwd: workspace.value.path,
    })

    if (!acpResult.ok) {
      sessionRepository.markError({ id: created.value.id })
      return sendProblem(reply, 409, buildAcpUnavailableProblem(acpResult.reason))
    }

    const ready = sessionRepository.markReady({
      id: created.value.id,
      acpSessionId: acpResult.acpSessionId,
      resumable: agentAdvertisesResumable(acpSupervisor),
    })

    if (!ready.ok) {
      throw new Error("session mark ready failed unexpectedly")
    }

    return reply.status(201).send(SessionSchema.parse(ready.value))
  })

  app.get("/v1/sessions", async (request, reply) => {
    const query = ListSessionsQuerySchema.parse(request.query)
    const result = sessionRepository.list({
      workspaceId: query.workspaceId,
      limit: query.limit,
      cursor: query.cursor,
    })

    if (!result.ok) {
      return sendProblem(reply, 400, buildInvalidCursorProblem())
    }

    const collection = SessionCollectionSchema.parse({
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

  app.get("/v1/sessions/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const result = sessionRepository.getById({ id: sessionId })

    if (!result.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    return reply.status(200).send(SessionSchema.parse(result.value))
  })

  app.patch("/v1/sessions/:sessionId", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const body = UpdateSessionBodySchema.parse(request.body)
    const result = sessionRepository.rename({ id: sessionId, name: body.name })

    if (!result.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    return reply.status(200).send(SessionSchema.parse(result.value))
  })

  app.post("/v1/sessions/:sessionId/select", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const existing = sessionRepository.getById({ id: sessionId })

    if (!existing.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    if (isArchivedSession(existing.value)) {
      return sendProblem(reply, 409, buildSessionArchivedProblem())
    }

    const timestamp = new Date().toISOString()
    const workspaceTouch = workspaceRepository.touchLastUsed({
      id: existing.value.workspaceId,
      lastUsedAt: timestamp,
    })

    if (!workspaceTouch.ok) {
      return sendProblem(reply, 404, buildWorkspaceNotFoundProblem())
    }

    const selected = sessionRepository.select({ id: sessionId, lastUsedAt: timestamp })

    if (!selected.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    return reply.status(200).send(SessionSchema.parse(selected.value))
  })

  app.post("/v1/sessions/:sessionId/archive", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const existing = sessionRepository.getById({ id: sessionId })

    if (!existing.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    if (isArchivedSession(existing.value)) {
      return sendProblem(reply, 409, buildSessionArchivedProblem())
    }

    const binding = sessionRepository.getAcpBinding({ id: sessionId })
    if (!binding.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    const closeSupported =
      acpSupervisor.getAgentCapabilities()?.sessionCapabilities.close === true

    if (closeSupported) {
      const supervisorReady = await ensureSupervisorReady(acpSupervisor, binding.value.agentId)
      if (!supervisorReady) {
        return sendProblem(reply, 409, buildAcpUnavailableProblem())
      }

      const closeResult = await acpSupervisor.closeAcpSession({
        acpSessionId: binding.value.acpSessionId,
      })

      if (!closeResult.ok) {
        return sendProblem(reply, 409, buildAcpUnavailableProblem(closeResult.reason))
      }
    }

    const archived = sessionRepository.archive({ id: sessionId })

    if (!archived.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    return reply.status(200).send(SessionSchema.parse(archived.value))
  })

  app.post("/v1/sessions/:sessionId/resume", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const existing = sessionRepository.getById({ id: sessionId })

    if (!existing.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    if (isArchivedSession(existing.value)) {
      return sendProblem(reply, 409, buildSessionArchivedProblem())
    }

    const binding = sessionRepository.getAcpBinding({ id: sessionId })
    if (!binding.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    if (!binding.value.resumable) {
      return sendProblem(reply, 409, buildSessionNotResumableProblem())
    }

    const workspace = workspaceRepository.getById({ id: binding.value.workspaceId })
    if (!workspace.ok) {
      return sendProblem(reply, 404, buildWorkspaceNotFoundProblem())
    }

    const supervisorReady = await ensureSupervisorReady(acpSupervisor, binding.value.agentId)
    if (!supervisorReady) {
      return sendProblem(reply, 409, buildAcpUnavailableProblem())
    }

    if (!agentAdvertisesResumable(acpSupervisor)) {
      return sendProblem(reply, 409, buildSessionNotResumableProblem())
    }

    const loadResult = await acpSupervisor.loadAcpSession({
      acpSessionId: binding.value.acpSessionId,
      workspaceCwd: workspace.value.path,
    })

    if (!loadResult.ok) {
      return sendProblem(reply, 409, buildSessionNotResumableProblem(loadResult.reason))
    }

    const resumed = sessionRepository.markReady({
      id: sessionId,
      acpSessionId: loadResult.acpSessionId,
      resumable: true,
    })

    if (!resumed.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    return reply.status(200).send(SessionSchema.parse(resumed.value))
  })
}
