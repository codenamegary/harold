import { AgentId, AgentSpawnSnapshot } from "contracts/http/agent-settings"
import {
  AcpClientCapabilities,
  defaultClientCapabilities,
} from "core/agent-catalog/profile.override"
import { catalogAgentsById } from "core/agent-catalog/generated"
import { productAgentOverridesById } from "core/agent-catalog/overrides"

export type { AcpClientCapabilities }

export type AgentProfile = {
  readonly id: AgentId
  readonly command: readonly string[]
  readonly authMethodId: string
  readonly clientCapabilities: AcpClientCapabilities
}

/**
 * Profile resolve = product override ∪ generated catalog defaults.
 * Registry-ahead agents resolve from a persisted spawn snapshot.
 */
export const resolveAgentProfile = (
  agentId: AgentId,
  spawnSnapshot?: AgentSpawnSnapshot | null,
): AgentProfile | undefined => {
  const catalogAgent = catalogAgentsById[agentId as keyof typeof catalogAgentsById]
  const override = productAgentOverridesById[agentId]

  if (catalogAgent !== undefined) {
    return {
      id: agentId,
      command: override?.command ?? catalogAgent.spawn.command,
      authMethodId: override?.authMethodId ?? catalogAgent.authMethodId,
      clientCapabilities: override?.clientCapabilities ?? defaultClientCapabilities,
    }
  }

  if (spawnSnapshot === null || spawnSnapshot === undefined) {
    return undefined
  }

  return {
    id: agentId,
    command: override?.command ?? spawnSnapshot.command,
    authMethodId: override?.authMethodId ?? spawnSnapshot.authMethodId,
    clientCapabilities: override?.clientCapabilities ?? defaultClientCapabilities,
  }
}
