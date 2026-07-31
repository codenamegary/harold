import { AgentId } from "contracts/http/agent-settings"
import { Session } from "contracts/http/session"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { WorkspaceRepository } from "../workspace/repository"
import { SessionRepository } from "./repository"
import { SessionService } from "./service"

export type ResumeSessionParams = {
  sessionId: string
  sessionRepository: SessionRepository
  sessionService: SessionService
  workspaceRepository: WorkspaceRepository
  acpSupervisor: AcpSupervisor
  mode: "auto" | "explicit"
}

export type ResumeSessionResult =
  | { kind: "ok"; session: Session }
  | { kind: "already-bound"; session: Session }
  | { kind: "skipped"; session: Session }
  | { kind: "not-found" }
  | { kind: "archived"; session: Session }
  | { kind: "not-resumable"; session: Session; reason?: string }
  | { kind: "acp-unavailable"; session?: Session; reason?: string }
  | { kind: "load-failed"; session: Session; reason: string }

const isArchivedSession = (session: {
  archivedAt: string | null
  state: string
}): boolean => session.archivedAt !== null || session.state === "archived"

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

export const resumeSession = async (
  params: ResumeSessionParams,
): Promise<ResumeSessionResult> => {
  const existing = params.sessionRepository.getById({ id: params.sessionId })
  if (!existing.ok) {
    return { kind: "not-found" }
  }

  if (isArchivedSession(existing.value)) {
    return { kind: "archived", session: existing.value }
  }

  const binding = params.sessionRepository.getAcpBinding({ id: params.sessionId })
  if (!binding.ok) {
    return { kind: "not-found" }
  }

  if (binding.value.acpSessionId === "pending") {
    if (params.mode === "auto") {
      return { kind: "skipped", session: existing.value }
    }

    return { kind: "not-resumable", session: existing.value }
  }

  if (!binding.value.resumable) {
    if (params.mode === "auto") {
      return { kind: "skipped", session: existing.value }
    }

    return { kind: "not-resumable", session: existing.value }
  }

  const liveBinding = params.acpSupervisor
    .getSessionBindingRegistry()
    .getBinding(binding.value.acpSessionId)

  if (liveBinding !== undefined) {
    return { kind: "already-bound", session: existing.value }
  }

  const workspace = params.workspaceRepository.getById({ id: binding.value.workspaceId })
  if (!workspace.ok) {
    return { kind: "not-found" }
  }

  const supervisorReady = await ensureSupervisorReady(
    params.acpSupervisor,
    binding.value.agentId,
  )
  if (!supervisorReady) {
    return {
      kind: "acp-unavailable",
      session: existing.value,
    }
  }

  if (!agentAdvertisesResumable(params.acpSupervisor)) {
    if (params.mode === "auto") {
      return { kind: "skipped", session: existing.value }
    }

    return { kind: "not-resumable", session: existing.value }
  }

  const loadResult = await params.acpSupervisor.loadAcpSession({
    acpSessionId: binding.value.acpSessionId,
    workspaceCwd: workspace.value.path,
    sessionId: params.sessionId,
    workspaceId: binding.value.workspaceId,
  })

  if (!loadResult.ok) {
    const failed = params.sessionService.markError({ id: params.sessionId })
    if (!failed.ok) {
      return { kind: "not-found" }
    }

    return {
      kind: "load-failed",
      session: failed.value,
      reason: loadResult.reason,
    }
  }

  const resumed = params.sessionService.resume({
    id: params.sessionId,
    acpSessionId: loadResult.acpSessionId,
    resumable: true,
  })

  if (!resumed.ok) {
    return { kind: "not-found" }
  }

  return { kind: "ok", session: resumed.value }
}

export const maybeAutoResumeSession = async (
  params: Omit<ResumeSessionParams, "mode">,
): Promise<ResumeSessionResult> =>
  resumeSession({
    ...params,
    mode: "auto",
  })
