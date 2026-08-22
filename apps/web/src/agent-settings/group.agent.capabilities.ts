import {
  AgentCapabilityInventory,
  AgentCapabilityInventoryEntry,
  AgentRuntimeState,
} from "contracts/http/agent-settings"

export type AgentCapabilityGroupKey = "missing" | "active" | "recognized" | "unknown"

export type AgentCapabilityGroups = Record<
  AgentCapabilityGroupKey,
  ReadonlyArray<AgentCapabilityInventoryEntry>
>

export const agentCapabilityGroupOrder: ReadonlyArray<AgentCapabilityGroupKey> = [
  "missing",
  "active",
  "recognized",
  "unknown",
]

export const agentCapabilityGroupLabels: Record<AgentCapabilityGroupKey, string> = {
  missing: "Unsupported by agent",
  active: "In use",
  recognized: "Available, unused",
  unknown: "Unknown to host",
}

export const classifyAgentCapabilityEntry = (
  entry: AgentCapabilityInventoryEntry,
): AgentCapabilityGroupKey | null => {
  if (!entry.known) {
    return "unknown"
  }

  if (entry.requiredBy.length > 0) {
    return entry.advertised ? "active" : "missing"
  }

  if (entry.advertised) {
    return "recognized"
  }

  return null
}

export const groupAgentCapabilities = (
  inventory: AgentCapabilityInventory,
): AgentCapabilityGroups => {
  const groups: Record<AgentCapabilityGroupKey, AgentCapabilityInventoryEntry[]> = {
    missing: [],
    active: [],
    recognized: [],
    unknown: [],
  }

  for (const entry of inventory.entries) {
    const group = classifyAgentCapabilityEntry(entry)
    if (group !== null) {
      groups[group].push(entry)
    }
  }

  return groups
}

export const agentCapabilitiesEmptyMessage = (
  state: AgentRuntimeState,
): string => {
  if (state.status === "error") {
    return "Capabilities unavailable while the agent is in error."
  }

  return "Capabilities appear when the agent is ready."
}

export const formatAgentCapabilityAgentInfoLabel = (
  inventory: AgentCapabilityInventory,
): string => {
  const info = inventory.agentInfo
  if (info === null) {
    return ""
  }

  const displayName = info.title ?? info.name
  return `${displayName} ${info.version}`
}

export const formatAgentCapabilityMethodsLabel = (
  requiredBy: ReadonlyArray<string>,
): string => {
  if (requiredBy.length === 0) {
    return ""
  }

  return `used by ${requiredBy.join(", ")}`
}
