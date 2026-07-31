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

export const agentAdvertisesResumable = (acpSupervisor: AcpSupervisor): boolean =>
  acpSupervisor.getAgentCapabilities()?.loadSession === true
