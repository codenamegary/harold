import { AgentId } from "contracts/http/agent-settings"
import { AcpSupervisor } from "../acp/supervisor/models"
import { AgentSettingsRepository } from "../agent-settings/agent-settings-repository"
import { ArchivedAcpSessionsStore } from "./archived.acp.sessions.store"
import { ensureSupervisorReady, agentAdvertisesSessionClose } from "./session.acp.ready"
import {
  buildAgentDisabledProblem,
  buildAgentNotFoundProblem,
  buildAgentUnavailableProblem,
} from "./session.problems"

export type DeleteAcpSessionResult =
  | { ok: true }
  | { ok: false; reason: string }

export const deleteAcpSession = async (params: {
  agentId: AgentId
  sessionId: string
  agentSettingsRepository: AgentSettingsRepository
  acpSupervisor: AcpSupervisor
  archivedAcpSessions: ArchivedAcpSessionsStore
}): Promise<DeleteAcpSessionResult> => {
  const agentSettings = params.agentSettingsRepository
    .list()
    .find((settings) => settings.id === params.agentId)

  if (agentSettings === undefined) {
    return {
      ok: false,
      reason: buildAgentNotFoundProblem().detail ?? "Agent not found",
    }
  }

  if (!agentSettings.available) {
    return {
      ok: false,
      reason: buildAgentUnavailableProblem().detail ?? "Agent unavailable",
    }
  }

  if (!agentSettings.enabled) {
    return {
      ok: false,
      reason: buildAgentDisabledProblem().detail ?? "Agent disabled",
    }
  }

  params.archivedAcpSessions.archive({
    agentId: params.agentId,
    sessionId: params.sessionId,
  })

  const supervisorReady = await ensureSupervisorReady(
    params.acpSupervisor,
    params.agentId,
  )
  if (
    supervisorReady.ok &&
    agentAdvertisesSessionClose(params.acpSupervisor, params.agentId)
  ) {
    // Catalog hide is the delete contract; close is best-effort and must not
    // hold the HTTP response behind agent RPC latency.
    void params.acpSupervisor.closeAcpSession({
      agentId: params.agentId,
      sessionId: params.sessionId,
    })
  }

  return { ok: true }
}
