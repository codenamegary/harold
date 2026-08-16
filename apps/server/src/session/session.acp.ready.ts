import { AgentId } from "contracts/http/agent-settings"
import { sanitizeAcpErrorMessage } from "../acp/sanitize-acp-error"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"

export const isArchivedSession = (session: {
  archivedAt: string | null
  state: string
}): boolean => session.archivedAt !== null || session.state === "archived"

export type EnsureSupervisorReadyResult =
  | { ok: true }
  | { ok: false; reason: string }

export const ensureSupervisorReady = async (
  acpSupervisor: Pick<AcpSupervisor, "getRunningAgentIds" | "start">,
  agentId: AgentId,
): Promise<EnsureSupervisorReadyResult> => {
  if (acpSupervisor.getRunningAgentIds().includes(agentId)) {
    return { ok: true }
  }

  try {
    await acpSupervisor.start(agentId)
    if (!acpSupervisor.getRunningAgentIds().includes(agentId)) {
      return { ok: false, reason: "ACP supervisor failed to become ready" }
    }
    return { ok: true }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "ACP supervisor failed to start"
    return {
      ok: false,
      reason: sanitizeAcpErrorMessage(message),
    }
  }
}

export const agentAdvertisesResumable = (
  acpSupervisor: AcpSupervisor,
  agentId?: AgentId,
): boolean => acpSupervisor.getAgentCapabilities(agentId)?.loadSession === true
