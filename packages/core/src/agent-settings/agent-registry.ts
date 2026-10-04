import {
  AgentId,
  AgentIdSchema,
  AgentSettings,
  AgentSpawnSnapshot,
  AgentSpawnSnapshotSchema,
} from "contracts/http/agent-settings"
import {
  catalogAgentList,
  catalogAgentsById,
} from "../agent-catalog/generated/catalog.agents.generated"
import { productAgentOverridesById } from "../agent-catalog/overrides/product.overrides"
import { popularAgentAllowlist } from "../agent-catalog/popular.allowlist"

export type AgentDefinition = {
  id: AgentId
  displayName: string
  available: boolean
  binaryName: string
}

const popularAgentIdSet = new Set<string>(popularAgentAllowlist)

export const isPopularAgentId = (agentId: AgentId): boolean => popularAgentIdSet.has(agentId)

export const isCatalogAgentId = (agentId: AgentId): boolean =>
  Object.prototype.hasOwnProperty.call(catalogAgentsById, agentId)

const toAgentDefinition = (agentId: AgentId): AgentDefinition => {
  const catalogAgent = catalogAgentsById[agentId as keyof typeof catalogAgentsById]
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

const buildAgentDefinitions = (): Record<string, AgentDefinition> => {
  const definitions: Record<string, AgentDefinition> = {}
  for (const definition of agentDefinitionList) {
    definitions[definition.id] = definition
  }
  return definitions
}

export const agentDefinitions: Record<string, AgentDefinition> = buildAgentDefinitions()

export type AgentRegistryMetadata = {
  command: readonly string[]
  authMethodId: string
  capabilities: readonly string[]
}

const buildAgentRegistryMetadata = (): Record<string, AgentRegistryMetadata> => {
  const metadata: Record<string, AgentRegistryMetadata> = {}
  for (const definition of agentDefinitionList) {
    const catalogAgent = catalogAgentsById[definition.id as keyof typeof catalogAgentsById]
    const override = productAgentOverridesById[definition.id]
    metadata[definition.id] = {
      command: override?.command ?? catalogAgent.spawn.command,
      authMethodId: override?.authMethodId ?? catalogAgent.authMethodId,
      capabilities: ["session/new", "session/prompt", "session/cancel"],
    }
  }
  return metadata
}

export const agentRegistryMetadataById: Record<string, AgentRegistryMetadata> =
  buildAgentRegistryMetadata()

export const parseSpawnSnapshot = (raw: string | null): AgentSpawnSnapshot | null => {
  if (raw === null) {
    return null
  }

  return AgentSpawnSnapshotSchema.parse(JSON.parse(raw))
}

export const serializeSpawnSnapshot = (snapshot: AgentSpawnSnapshot): string =>
  JSON.stringify(snapshot)

export const resolveTemplateBinaryName = (
  agentId: AgentId,
  spawnSnapshot: AgentSpawnSnapshot | null,
): string | null => {
  const definition = agentDefinitions[agentId]
  if (definition !== undefined) {
    return definition.binaryName
  }

  return spawnSnapshot?.binaryName ?? null
}

export const resolveTemplateArgs = (
  agentId: AgentId,
  spawnSnapshot: AgentSpawnSnapshot | null,
): string[] => {
  const override = productAgentOverridesById[agentId]
  const catalogAgent = catalogAgentsById[agentId as keyof typeof catalogAgentsById]
  const command = override?.command ?? catalogAgent?.spawn.command ?? spawnSnapshot?.command

  if (command === undefined) {
    return []
  }

  return command.slice(1)
}

export const toAgentSettings = (input: {
  id: AgentId
  displayName: string
  available: boolean
  enabled: boolean
  path: string | null
  args: string[]
  present: boolean
  popular: boolean
  deletable: boolean
}): AgentSettings => ({
  id: input.id,
  displayName: input.displayName,
  available: input.available,
  enabled: input.enabled,
  path: input.path,
  args: input.args,
  present: input.present,
  popular: input.popular,
  deletable: input.deletable,
  state: {
    status: "stopped",
    error: null,
  },
  capabilities: null,
  authSummary: {
    status: "unknown",
    error: null,
    activeSessionId: null,
    canLogout: false,
  },
})

export const sortAgentSettingsBands = (items: readonly AgentSettings[]): AgentSettings[] => {
  const bandRank = (item: AgentSettings): number => {
    if (item.enabled) {
      return 0
    }
    if (item.present) {
      return 1
    }
    if (item.popular) {
      return 2
    }
    return 3
  }

  return [...items].sort((left, right) => {
    const bandDiff = bandRank(left) - bandRank(right)
    if (bandDiff !== 0) {
      return bandDiff
    }
    return left.displayName.localeCompare(right.displayName)
  })
}
