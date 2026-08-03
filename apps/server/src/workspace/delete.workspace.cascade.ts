import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"
import { SessionRepository } from "../session/repository"
import { WorkspaceRepository } from "./repository"
import { WorkspaceService } from "./service"

export type DeleteWorkspaceCascadeResult =
  | { ok: true }
  | { ok: false; kind: "active_sessions"; detail: string }
  | { ok: false; kind: "not_found" }

export const deleteWorkspaceWithCascade = async (params: {
  workspaceId: string
  force: boolean
  workspaceRepository: WorkspaceRepository
  workspaceService: WorkspaceService
  sessionRepository: SessionRepository
  acpSupervisor: AcpSupervisor
}): Promise<DeleteWorkspaceCascadeResult> => {
  const workspace = params.workspaceRepository.getById({ id: params.workspaceId })
  if (!workspace.ok) {
    return { ok: false, kind: "not_found" }
  }

  const liveSessions = params.sessionRepository.listLiveByWorkspace({
    workspaceId: params.workspaceId,
  })
  const closeResult = await params.acpSupervisor.closeWorkspaceSessions({
    sessions: liveSessions.map((session) => ({
      acpSessionId: session.acpSessionId,
      agentId: session.agentId,
    })),
  })

  if (closeResult.failures.length > 0 && !params.force) {
    return {
      ok: false,
      kind: "active_sessions",
      detail: closeResult.failures.map((failure) => failure.reason).join("; "),
    }
  }

  if (closeResult.failures.length > 0) {
    params.acpSupervisor.unbindWorkspaceSessions({
      sessions: closeResult.failures.map((failure) => ({
        acpSessionId: failure.acpSessionId,
        agentId:
          liveSessions.find((session) => session.acpSessionId === failure.acpSessionId)?.agentId ??
          "cursor",
      })),
    })
  }

  const deleted = params.workspaceService.delete({ id: params.workspaceId })
  if (!deleted.ok) {
    return { ok: false, kind: "not_found" }
  }

  return { ok: true }
}
