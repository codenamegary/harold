import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { WorkspaceRepository } from "../workspace/repository"
import { maybeAutoResumeSession } from "./resume.session"
import { SessionRepository } from "./repository"
import { SessionService } from "./service"

export type RunStartupRecoveryParams = {
  sessionRepository: SessionRepository
  sessionService: SessionService
  workspaceRepository: WorkspaceRepository
  acpSupervisor: AcpSupervisor
}

export const runStartupRecovery = async (
  params: RunStartupRecoveryParams,
): Promise<void> => {
  const candidates = params.sessionRepository.listNeedsStartupRecovery()

  for (const candidate of candidates) {
    await maybeAutoResumeSession({
      sessionId: candidate.id,
      sessionRepository: params.sessionRepository,
      sessionService: params.sessionService,
      workspaceRepository: params.workspaceRepository,
      acpSupervisor: params.acpSupervisor,
    })

    params.sessionRepository.clearNeedsStartupRecovery({ id: candidate.id })
  }
}
