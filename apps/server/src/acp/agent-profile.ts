import { AgentId } from "contracts/http/agent-settings"
import {
  AcpClientCapabilities,
  defaultClientCapabilities,
} from "./catalog/agent.profile.override"
import { catalogAgentsById } from "./catalog/generated/catalog.agents.generated"
import { productAgentOverridesById } from "./catalog/overrides/product.overrides"
import { ExtensionHandlers } from "./client/extensions/types"

export type { AcpClientCapabilities }

export type AgentProfile = {
  readonly id: AgentId
  readonly command: readonly string[]
  readonly authMethodId: string
  readonly clientCapabilities: AcpClientCapabilities
  readonly extensionHandlers: ExtensionHandlers
}

const emptyExtensionHandlers: ExtensionHandlers = {}

/**
 * Profile resolve = product override ∪ generated catalog defaults.
 */
export const resolveAgentProfile = (agentId: AgentId): AgentProfile | undefined => {
  const catalogAgent = catalogAgentsById[agentId]
  if (catalogAgent === undefined) {
    return undefined
  }

  const override = productAgentOverridesById[agentId]

  return {
    id: agentId,
    command: override?.command ?? catalogAgent.spawn.command,
    authMethodId: override?.authMethodId ?? catalogAgent.authMethodId,
    clientCapabilities: override?.clientCapabilities ?? defaultClientCapabilities,
    extensionHandlers: override?.extensionHandlers ?? emptyExtensionHandlers,
  }
}

const resolvedCursorProfile = resolveAgentProfile("cursor")
if (resolvedCursorProfile === undefined) {
  throw new Error("cursor agent is missing from the ACP catalog")
}

export const cursorAgentProfile: AgentProfile = resolvedCursorProfile