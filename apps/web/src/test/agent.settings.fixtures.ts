import { AgentCapabilityInventory, AgentRuntimeState } from "contracts/http/agent-settings"

export const nullAgentCapabilities = null

export const fakeReadyAgentCapabilities: AgentCapabilityInventory = {
  agentInfo: { name: "fake-acp", version: "0.0.0" },
  entries: [
    {
      path: "loadSession",
      advertised: true,
      value: true,
      known: true,
      requiredBy: ["session/load"],
    },
  ],
}

export const agentCapabilitiesForState = (
  state: Pick<AgentRuntimeState, "status">,
  capabilities?: AgentCapabilityInventory | null,
): AgentCapabilityInventory | null => {
  if (capabilities !== undefined) {
    return capabilities
  }
  return state.status === "ready" ? fakeReadyAgentCapabilities : nullAgentCapabilities
}
