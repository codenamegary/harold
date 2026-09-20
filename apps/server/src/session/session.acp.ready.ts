import { AgentId } from "contracts/http/agent-settings"
import {
  inventoryAdvertisesResumable,
  inventoryAdvertisesSessionClose,
  inventoryAdvertisesSessionList,
} from "../acp/agent/inventory"
import { AcpSupervisor } from "../acp/supervisor/models"
import { sanitizeAcpErrorMessage } from "../acp/sanitize.error"
import {
  EnsureSupervisorReady,
  EnsureSupervisorReadyResult,
  GetRunningAgentIds,
  StartAcpAgent,
} from "./session.ports"

export const isArchivedSession = (session: {
  archivedAt: string | null
  state: string
}): boolean => session.archivedAt !== null || session.state === "archived"

export type EnsureSupervisorReadyDeps = Readonly<{
  getRunningAgentIds: GetRunningAgentIds
  start: StartAcpAgent
}>

export const makeEnsureSupervisorReady =
  (deps: EnsureSupervisorReadyDeps): EnsureSupervisorReady =>
  async (agentId): Promise<EnsureSupervisorReadyResult> => {
    if (deps.getRunningAgentIds().includes(agentId)) {
      return { ok: true }
    }

    try {
      await deps.start(agentId)
      if (!deps.getRunningAgentIds().includes(agentId)) {
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
  acpSupervisor: Pick<AcpSupervisor, "getCapabilityInventory">,
  agentId: AgentId,
): boolean =>
  inventoryAdvertisesResumable(acpSupervisor.getCapabilityInventory(agentId))

export const agentAdvertisesSessionClose = (
  acpSupervisor: Pick<AcpSupervisor, "getCapabilityInventory">,
  agentId: AgentId,
): boolean =>
  inventoryAdvertisesSessionClose(acpSupervisor.getCapabilityInventory(agentId))

export const agentAdvertisesSessionList = (
  acpSupervisor: Pick<AcpSupervisor, "getCapabilityInventory">,
  agentId: AgentId,
): boolean =>
  inventoryAdvertisesSessionList(acpSupervisor.getCapabilityInventory(agentId))
