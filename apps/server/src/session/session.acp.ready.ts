import { AgentId } from "contracts/http/agent-settings"
import {
  inventoryAdvertisesResumable,
  inventoryAdvertisesSessionClose,
  inventoryAdvertisesSessionList,
} from "../acp/agent/inventory"
import { AcpSupervisor } from "../acp/supervisor/supervisor"
import { sanitizeAcpErrorMessage } from "../acp/sanitize.error"
import {
  EnsureSessionBound,
  EnsureSupervisorReady,
  EnsureSupervisorReadyResult,
  GetRunningAgentIds,
  SessionHubLoadSession,
  StartAcpAgent,
} from "./session.ports"

export const isArchivedSession = (session: { archivedAt: string | null; state: string }): boolean =>
  session.archivedAt !== null || session.state === "archived"

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

    const startResult = await deps.start(agentId)
    if (!startResult.ok) {
      return { ok: false, reason: sanitizeAcpErrorMessage(startResult.reason) }
    }

    if (!deps.getRunningAgentIds().includes(agentId)) {
      return { ok: false, reason: "ACP supervisor failed to become ready" }
    }
    return { ok: true }
  }

export type EnsureSessionBoundDeps = Readonly<{
  isSessionBound: (sessionId: string) => boolean
  ensureSupervisorReady: EnsureSupervisorReady
  loadSession: SessionHubLoadSession
}>

/**
 * Bind upsert for prompts: an already-bound session is left untouched;
 * otherwise the agent is started when needed and the session is loaded, which
 * binds it. Fails only when the binding cannot be established.
 */
export const makeEnsureSessionBound =
  (deps: EnsureSessionBoundDeps): EnsureSessionBound =>
  async ({ agentId, sessionId, cwd }) => {
    if (deps.isSessionBound(sessionId)) {
      return { ok: true }
    }

    const ready = await deps.ensureSupervisorReady(agentId)
    if (!ready.ok) {
      return { ok: false, reason: ready.reason }
    }

    const loaded = await deps.loadSession({ agentId, sessionId, cwd })
    return loaded.ok
      ? { ok: true }
      : {
          ok: false,
          reason: loaded.reason,
          ...(loaded.authRequired === true ? { authRequired: true } : {}),
        }
  }

export const agentAdvertisesResumable = (
  acpSupervisor: Pick<AcpSupervisor, "getCapabilityInventory">,
  agentId: AgentId,
): boolean => inventoryAdvertisesResumable(acpSupervisor.getCapabilityInventory(agentId))

export const agentAdvertisesSessionClose = (
  acpSupervisor: Pick<AcpSupervisor, "getCapabilityInventory">,
  agentId: AgentId,
): boolean => inventoryAdvertisesSessionClose(acpSupervisor.getCapabilityInventory(agentId))

export const agentAdvertisesSessionList = (
  acpSupervisor: Pick<AcpSupervisor, "getCapabilityInventory">,
  agentId: AgentId,
): boolean => inventoryAdvertisesSessionList(acpSupervisor.getCapabilityInventory(agentId))
