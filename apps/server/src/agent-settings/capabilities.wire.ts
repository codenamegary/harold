import {
  AgentCapabilityInventory,
  AgentRuntimeState,
} from "contracts/http/agent-settings"
import { CapabilityInventory } from "../acp/agent/inventory"

export const wireAgentCapabilities = (
  runtimeState: Pick<AgentRuntimeState, "status">,
  inventory: CapabilityInventory | null,
): AgentCapabilityInventory | null => {
  if (runtimeState.status !== "ready" || inventory === null) {
    return null
  }

  return {
    agentInfo: inventory.agentInfo,
    entries: inventory.entries.map((entry) => ({
      path: entry.path,
      advertised: entry.advertised,
      ...(entry.advertised && entry.value !== undefined ? { value: entry.value } : {}),
      known: entry.known,
      requiredBy: [...entry.requiredBy],
    })),
  }
}
