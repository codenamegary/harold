import { AgentId, AgentIdSchema, AgentSettings } from "contracts/http/agent-settings"
import { catalogAgentList, catalogAgentsById } from "../acp/catalog/generated/catalog.agents.generated"
import { productAgentOverridesById } from "../acp/catalog/overrides/product.overrides"

export type AgentDefinition = {
  id: AgentId
  displayName: string
  available: boolean
  binaryName: string
}

const toAgentDefinition = (agentId: AgentId): AgentDefinition => {
  const catalogAgent = catalogAgentsById[agentId]
  const override = productAgentOverridesById[agentId]

  return {
    id: agentId,
    displayName: catalogAgent.displayName,
    available: catalogAgent.available,
    binaryName: override?.binaryName ?? catalogAgent.spawn.binaryName,
  }
}

export const agentDefinitionList: AgentDefinition[] = catalogAgentList.map((agent) =>
  toAgentDefinition(AgentIdSchema.parse(agent.id)),
)

const buildAgentDefinitions = (): Record<AgentId, AgentDefinition> => {
  const definitions = {} as Record<AgentId, AgentDefinition>
  for (const definition of agentDefinitionList) {
    definitions[definition.id] = definition
  }
  return definitions
}

export const agentDefinitions: Record<AgentId, AgentDefinition> = buildAgentDefinitions()

export type AgentRegistryMetadata = {
  command: readonly string[]
  authMethodId: string
  capabilities: readonly string[]
}

const buildAgentRegistryMetadata = (): Record<AgentId, AgentRegistryMetadata> => {
  const metadata = {} as Record<AgentId, AgentRegistryMetadata>
  for (const definition of agentDefinitionList) {
    const catalogAgent = catalogAgentsById[definition.id]
    const override = productAgentOverridesById[definition.id]
    metadata[definition.id] = {
      command: override?.command ?? catalogAgent.spawn.command,
      authMethodId: override?.authMethodId ?? catalogAgent.authMethodId,
      capabilities: ["session/new", "session/prompt", "session/cancel"],
    }
  }
  return metadata
}

export const agentRegistryMetadataById: Record<AgentId, AgentRegistryMetadata> =
  buildAgentRegistryMetadata()

export const toAgentSettings = (
  definition: AgentDefinition,
  row: {
    enabled: boolean
    path: string | null
  },
): AgentSettings => ({
  id: definition.id,
  displayName: definition.displayName,
  available: definition.available,
  enabled: row.enabled,
  path: row.path,
})
