import { AgentId } from "contracts/http/agent-settings"
import { AcpSupervisor } from "../acp/supervisor/acp-supervisor-types"

export const isArchivedSession = (session: {
  archivedAt: string | null
  state: string
}): boolean => session.archivedAt !== null || session.state === "archived"

export const ensureSupervisorReady = async (
  acpSupervisor: AcpSupervisor,
  agentId: AgentId,
): Promise<boolean> => {
  if (acpSupervisor.getRunningAgentIds().includes(agentId)) {
    return true
  }

  try {
    await acpSupervisor.start(agentId)
    return acpSupervisor.getRunningAgentIds().includes(agentId)
  } catch {
    return false
  }
}

export const agentAdvertisesResumable = (
  acpSupervisor: AcpSupervisor,
  agentId?: AgentId,
): boolean => acpSupervisor.getAgentCapabilities(agentId)?.loadSession === true
