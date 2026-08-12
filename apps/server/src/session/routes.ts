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
import {
  PermissionRequestCollectionSchema,
  ResolvePermissionRequestBodySchema,
  ResolvePermissionRequestResponseSchema,
} from "contracts/http/permission"
import { FastifyInstance } from "fastify"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { AgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { PermissionService } from "../permission/service"
import { WorkspaceRepository } from "../workspace/repository"
import { SessionRepository } from "./repository"
import { maybeAutoResumeSession, resumeSession } from "./resume.session"
import {
  ensureSupervisorReady,
  isArchivedSession,
} from "./session.acp.ready"
import { SessionService } from "./service"
import {
  buildAcpUnavailableProblem,
  buildAgentDisabledProblem,
  buildAgentNotFoundProblem,
  buildAgentUnavailableProblem,
  buildNoActiveTurnProblem,
  buildPermissionConflictProblem,
  buildPermissionNotFoundProblem,
  buildPermissionValidationProblem,
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

export const registerSessionRoutes = (
  app: FastifyInstance,
  sessionRepository: SessionRepository,
  sessionService: SessionService,
  workspaceRepository: WorkspaceRepository,
  agentSettingsRepository: AgentSettingsRepository,
  acpSupervisor: AcpSupervisor,
  permissionService: PermissionService,
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
      if (
        current.ok &&
        (current.value.state === "running" || current.value.state === "stopping")
      ) {
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

    return reply.status(200).send(
      SessionCollectionSchema.parse({
        items: listed.sessions,
      }),
    )
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

    if (existing.value.state === "running" || existing.value.state === "stopping") {
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

    permissionService.clearSessionPending(sessionId)

    const stopping = sessionService.markStopping({ id: sessionId })
    if (!stopping.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    const cancelled = await acpSupervisor.cancelAcpSession({
      acpSessionId: binding.value.acpSessionId,
    })

    if (!cancelled.ok) {
      sessionService.markRunning({ id: sessionId })
      return sendProblem(reply, 409, buildAcpUnavailableProblem(cancelled.reason))
    }

    return reply.status(202).send(CancelSessionResponseSchema.parse({ turnId: activeTurnId }))
  })

  app.get("/v1/sessions/:sessionId/permissions", async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const query = request.query as { status?: string }

    if (query.status !== undefined && query.status !== "pending") {
      return sendProblem(
        reply,
        400,
        buildPermissionValidationProblem("status must be pending when provided"),
      )
    }

    const existing = sessionRepository.getById({ id: sessionId })
    if (!existing.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    if (isArchivedSession(existing.value)) {
      return sendProblem(reply, 409, buildSessionArchivedProblem())
    }

    const items = permissionService.listPendingForSession(sessionId)

    return reply.status(200).send(
      PermissionRequestCollectionSchema.parse({
        items,
        page: {
          limit: Math.max(items.length, 1),
          count: items.length,
        },
      }),
    )
  })

  app.patch("/v1/sessions/:sessionId/permissions/:requestId", async (request, reply) => {
    const { sessionId, requestId } = request.params as {
      sessionId: string
      requestId: string
    }
    const body = ResolvePermissionRequestBodySchema.parse(request.body)

    const existing = sessionRepository.getById({ id: sessionId })
    if (!existing.ok) {
      return sendProblem(reply, 404, buildSessionNotFoundProblem())
    }

    if (isArchivedSession(existing.value)) {
      return sendProblem(reply, 409, buildSessionArchivedProblem())
    }

    const resolved = permissionService.resolvePending({ sessionId, requestId, body })
    if (!resolved.ok) {
      switch (resolved.kind) {
        case "not_found":
          return sendProblem(reply, 404, buildPermissionNotFoundProblem())
        case "conflict":
          return sendProblem(reply, 409, buildPermissionConflictProblem(resolved.detail))
        case "validation":
          return sendProblem(reply, 400, buildPermissionValidationProblem(resolved.detail ?? "invalid option"))
        case "journal_failed":
          return sendProblem(reply, 409, buildAcpUnavailableProblem("Failed to record permission decision"))
      }
    }

    return reply
      .status(200)
      .send(ResolvePermissionRequestResponseSchema.parse(resolved.value))
  })
}
