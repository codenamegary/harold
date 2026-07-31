import { AgentId } from "contracts/http/agent-settings"
import {
  CancelSessionBodySchema,
  CancelSessionResponseSchema,
  CreateSessionBodySchema,
  CreateSessionResponseSchema,
  ListSessionsQuerySchema,
  PromptSessionBodySchema,
  PromptSessionResponseSchema,
  SessionCollectionSchema,
  SessionSchema,
  UpdateSessionBodySchema,
} from "contracts/http/session"
import { FastifyInstance } from "fastify"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { AgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { agentDefinitions } from "../agent-settings/agent-registry"
import { WorkspaceRepository } from "../workspace/repository"
import { deriveSessionNameFromPrompt } from "./derive.session.name"
import { SessionRepository } from "./repository"
import { maybeAutoResumeSession, resumeSession } from "./resume.session"
import { SessionService } from "./service"
import {
  buildAcpUnavailableProblem,
  buildAgentDisabledProblem,
  buildAgentNotFoundProblem,
  buildAgentUnavailableProblem,
  buildInvalidCursorProblem,
  buildNoActiveTurnProblem,
  buildSessionArchivedProblem,
  buildSessionNotFoundProblem,
  buildSessionNotResumableProblem,
  buildTurnInProgressProblem,
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
  sessionService: SessionService,
  workspaceRepository: WorkspaceRepository,
  agentSettingsRepository: AgentSettingsRepository,
  acpSupervisor: AcpSupervisor,
) => {
  const startAcceptedPrompt = async (params: {
    sessionId: string
    acpSessionId: string
    agentId: AgentId
    text: string
  }): Promise<
    | { ok: true; turnId: string; session: ReturnType<typeof SessionSchema.parse> }
    | { ok: false; status: number; problem: unknown }
  > => {
    const supervisorReady = await ensureSupervisorReady(acpSupervisor, params.agentId)
    if (!supervisorReady) {
      sessionService.markIdle({ id: params.sessionId })
      return { ok: false, status: 409, problem: buildAcpUnavailableProblem() }
    }

    const running = sessionService.markRunning({ id: params.sessionId })
    if (!running.ok) {
      return { ok: false, status: 404, problem: buildSessionNotFoundProblem() }
    }

    const started = await acpSupervisor.startPromptAcpSession({
      acpSessionId: params.acpSessionId,
      prompt: [{ type: "text", text: params.text }],
    })

    if (!started.ok) {
      sessionService.markIdle({ id: params.sessionId })
      return {
        ok: false,
        status: 409,
        problem: buildAcpUnavailableProblem(started.reason),
      }
    }

    void started.completion.finally(() => {
      const current = sessionRepository.getById({ id: params.sessionId })
      if (current.ok && current.value.state === "running") {
        sessionService.markIdle({ id: params.sessionId })
      }
    })

    return {
      ok: true,
      turnId: started.turnId,
      session: SessionSchema.parse(running.value),
    }
  }

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

    const created = sessionService.createStarting({
      workspaceId: body.workspaceId,
      agentId: body.agentId,
      name: deriveSessionNameFromPrompt(body.text),
    })

    if (!created.ok) {
      throw new Error("session create failed unexpectedly")
    }

    const supervisorReady = await ensureSupervisorReady(acpSupervisor, body.agentId)
    if (!supervisorReady) {
      sessionService.markError({ id: created.value.id })
      return sendProblem(reply, 409, buildAcpUnavailableProblem())
    }

    const acpResult = await acpSupervisor.createAcpSession({
      workspaceCwd: workspace.value.path,
      sessionId: created.value.id,
      workspaceId: body.workspaceId,
    })

    if (!acpResult.ok) {
      sessionService.markError({ id: created.value.id })
      return sendProblem(reply, 409, buildAcpUnavailableProblem(acpResult.reason))
    }

    const ready = sessionService.markReady({
      id: created.value.id,
      acpSessionId: acpResult.acpSessionId,
      resumable: agentAdvertisesResumable(acpSupervisor),
    })

    if (!ready.ok) {
      throw new Error("session mark ready failed unexpectedly")
    }

    const prompted = await startAcceptedPrompt({
      sessionId: ready.value.id,
      acpSessionId: acpResult.acpSessionId,
      agentId: body.agentId,
      text: body.text,
    })

    if (!prompted.ok) {
      sessionService.markError({ id: created.value.id })
      return sendProblem(reply, prompted.status, prompted.problem)
    }

    return reply.status(201).send(
      CreateSessionResponseSchema.parse({
        ...prompted.session,
        turnId: prompted.turnId,
      }),
    )
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

    await maybeAutoResumeSession({
      sessionId,
      sessionRepository,
      sessionService,
      workspaceRepository,
      acpSupervisor,
    })

    const afterResume = sessionRepository.getById({ id: sessionId })
    if (!afterResume.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    const timestamp = new Date().toISOString()
    const workspaceTouch = workspaceRepository.touchLastUsed({
      id: afterResume.value.workspaceId,
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
    } else {
      acpSupervisor.unbindWorkspaceSessions({
        sessions: [{
          acpSessionId: binding.value.acpSessionId,
          agentId: binding.value.agentId,
        }],
      })
    }

    const archived = sessionService.archive({ id: sessionId })

    if (!archived.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    return reply.status(200).send(SessionSchema.parse(archived.value))
  })

  app.post("/v1/sessions/:sessionId/resume", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const result = await resumeSession({
      sessionId,
      sessionRepository,
      sessionService,
      workspaceRepository,
      acpSupervisor,
      mode: "explicit",
    })

    switch (result.kind) {
      case "ok":
      case "already-bound":
        return reply.status(200).send(SessionSchema.parse(result.session))
      case "not-found":
        return sendProblem(reply, 404, buildSessionNotFoundProblem())
      case "archived":
        return sendProblem(reply, 409, buildSessionArchivedProblem())
      case "acp-unavailable":
        return sendProblem(reply, 409, buildAcpUnavailableProblem(result.reason))
      case "not-resumable":
      case "load-failed":
        return sendProblem(reply, 409, buildSessionNotResumableProblem(result.reason))
      case "skipped":
        return sendProblem(reply, 409, buildSessionNotResumableProblem())
    }
  })

  app.post("/v1/sessions/:sessionId/prompt", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const body = PromptSessionBodySchema.parse(request.body)

    const existing = sessionRepository.getById({ id: sessionId })
    if (!existing.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    if (isArchivedSession(existing.value)) {
      return sendProblem(reply, 409, buildSessionArchivedProblem())
    }

    if (existing.value.state === "running") {
      return sendProblem(reply, 409, buildTurnInProgressProblem())
    }

    const autoResume = await maybeAutoResumeSession({
      sessionId,
      sessionRepository,
      sessionService,
      workspaceRepository,
      acpSupervisor,
    })

    if (autoResume.kind === "load-failed") {
      return sendProblem(reply, 409, buildSessionNotResumableProblem(autoResume.reason))
    }

    if (autoResume.kind === "acp-unavailable") {
      return sendProblem(reply, 409, buildAcpUnavailableProblem(autoResume.reason))
    }

    const current = sessionRepository.getById({ id: sessionId })
    if (!current.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    if (current.value.state !== "idle") {
      return sendProblem(reply, 409, buildAcpUnavailableProblem("Session is not ready for prompts"))
    }

    const binding = sessionRepository.getAcpBinding({ id: sessionId })
    if (!binding.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    if (binding.value.acpSessionId === "pending") {
      return sendProblem(reply, 409, buildAcpUnavailableProblem("Session is not bound"))
    }

    const liveBinding = acpSupervisor
      .getSessionBindingRegistry()
      .getBinding(binding.value.acpSessionId)

    if (liveBinding === undefined) {
      return sendProblem(reply, 409, buildAcpUnavailableProblem("Session is not bound"))
    }

    const prompted = await startAcceptedPrompt({
      sessionId,
      acpSessionId: binding.value.acpSessionId,
      agentId: binding.value.agentId,
      text: body.text,
    })

    if (!prompted.ok) {
      return sendProblem(reply, prompted.status, prompted.problem)
    }

    return reply.status(202).send(PromptSessionResponseSchema.parse({ turnId: prompted.turnId }))
  })

  app.post("/v1/sessions/:sessionId/cancel", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    CancelSessionBodySchema.parse(request.body ?? {})

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

    if (binding.value.acpSessionId === "pending") {
      return sendProblem(reply, 409, buildAcpUnavailableProblem("Session is not bound"))
    }

    const liveBinding = acpSupervisor
      .getSessionBindingRegistry()
      .getBinding(binding.value.acpSessionId)

    if (liveBinding === undefined) {
      return sendProblem(reply, 409, buildAcpUnavailableProblem("Session is not bound"))
    }

    const supervisorReady = await ensureSupervisorReady(acpSupervisor, binding.value.agentId)
    if (!supervisorReady) {
      return sendProblem(reply, 409, buildAcpUnavailableProblem())
    }

    const activeTurnId = liveBinding.activeTurnId
    if (activeTurnId === undefined) {
      return sendProblem(reply, 409, buildNoActiveTurnProblem())
    }

    const cancelled = await acpSupervisor.cancelAcpSession({
      acpSessionId: binding.value.acpSessionId,
    })

    if (!cancelled.ok) {
      return sendProblem(reply, 409, buildAcpUnavailableProblem(cancelled.reason))
    }

    return reply.status(202).send(CancelSessionResponseSchema.parse({ turnId: activeTurnId }))
  })
}
