import { AgentId } from "contracts/http/agent-settings"
import { catalogAgentsById } from "../acp/catalog/generated/catalog.agents.generated"
import {
  isCatalogAgentId,
  isPopularAgentId,
  parseSpawnSnapshot,
  resolveTemplateArgs,
  resolveTemplateBinaryName,
  toAgentSettings,
} from "./agent-registry"
import { parseArgs } from "./agent.settings.args"
import {
  AgentSettingsRow,
  BuildAgentSettingsView,
  ProbeAgentPresence,
} from "./agent.settings.ports"
import { isCustomAgentId } from "./custom.agent.id"
import { ValidateExecutablePathFn } from "./validate-agent-path"

export type AgentSettingsViewDeps = Readonly<{
  probePresence: ProbeAgentPresence
  validatePath: ValidateExecutablePathFn
}>

export const resolveDisplayName = (
  agentId: AgentId,
  row: AgentSettingsRow | undefined,
): string => {
  const catalogAgent = catalogAgentsById[agentId as keyof typeof catalogAgentsById]
  if (catalogAgent !== undefined) {
    return catalogAgent.displayName
  }

  const snapshot = parseSpawnSnapshot(row?.spawnSnapshot ?? null)
  if (snapshot !== null) {
    return snapshot.displayName
  }

  return agentId
}

const resolveAvailable = (agentId: AgentId): boolean => {
  const catalogAgent = catalogAgentsById[agentId as keyof typeof catalogAgentsById]
  return catalogAgent?.available ?? true
}

export const makeAgentSettingsView =
  (deps: AgentSettingsViewDeps): BuildAgentSettingsView =>
  (agentId, row) => {
    const spawnSnapshot = parseSpawnSnapshot(row?.spawnSnapshot ?? null)
    const presence = deps.probePresence(agentId, spawnSnapshot ?? undefined)
    const storedArgs = parseArgs(row?.args ?? null)
    const path = isCustomAgentId(agentId)
      ? (row?.path ?? null)
      : (row?.path ?? resolveTemplateBinaryName(agentId, spawnSnapshot))
    const present =
      isCustomAgentId(agentId)
        ? path !== null && deps.validatePath(path)
        : presence.present

    return toAgentSettings({
      id: agentId,
      displayName: resolveDisplayName(agentId, row),
      available: resolveAvailable(agentId),
      enabled: row?.enabled ?? false,
      path,
      args: isCustomAgentId(agentId)
        ? (storedArgs ?? [])
        : (storedArgs ?? resolveTemplateArgs(agentId, spawnSnapshot)),
      present,
      popular: isPopularAgentId(agentId),
      deletable: !isCatalogAgentId(agentId),
    })
  }
