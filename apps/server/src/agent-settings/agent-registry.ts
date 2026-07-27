import { AgentId, AgentSettings } from "contracts/http/agent-settings"

export type AgentDefinition = {
  id: AgentId
  displayName: string
  available: boolean
  binaryName: string
}

export const agentDefinitions: Record<AgentId, AgentDefinition> = {
  cursor: {
    id: "cursor",
    displayName: "Cursor",
    available: true,
    binaryName: "agent",
  },
  claude: {
    id: "claude",
    displayName: "Claude",
    available: false,
    binaryName: "claude",
  },
}

export const agentDefinitionList: AgentDefinition[] = Object.values(agentDefinitions)

export type AgentRegistryMetadata = {
  command: readonly string[]
  authMethodId: string
  capabilities: readonly string[]
}

export const agentRegistryMetadataById: Record<AgentId, AgentRegistryMetadata> = {
  cursor: {
    command: ["agent", "acp"],
    authMethodId: "cursor_login",
    capabilities: ["session/new", "session/prompt", "session/cancel"],
  },
  claude: {
    command: ["claude"],
    authMethodId: "claude",
    capabilities: [],
  },
}

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
