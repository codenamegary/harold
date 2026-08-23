import { AgentAuthSummary } from "contracts/http/agent-auth"
import { AgentCapabilityInventory, AgentRuntimeState } from "contracts/http/agent-settings"

export const defaultAuthSummary: AgentAuthSummary = {
  status: "unknown",
  error: null,
  activeSessionId: null,
  canLogout: false,
}

export const nullAgentCapabilities = null

export const fakeReadyAgentCapabilities: AgentCapabilityInventory = {
  agentInfo: { name: "fake-acp", version: "0.0.0", title: "Fake ACP" },
  entries: [
    {
      path: "loadSession",
      advertised: true,
      value: true,
      known: true,
      requiredBy: ["session/load"],
    },
    {
      path: "sessionCapabilities.list",
      advertised: true,
      value: {},
      known: true,
      requiredBy: ["session/list"],
    },
    {
      path: "promptCapabilities.image",
      advertised: true,
      value: true,
      known: true,
      requiredBy: [],
    },
    {
      path: "_meta.vendor.quirk",
      advertised: true,
      value: 1,
      known: false,
      requiredBy: [],
    },
  ],
}

export const agentMissingListCapability: AgentCapabilityInventory = {
  agentInfo: { name: "list-less", version: "1.0.0" },
  entries: [
    {
      path: "loadSession",
      advertised: true,
      value: true,
      known: true,
      requiredBy: ["session/load"],
    },
    {
      path: "sessionCapabilities.list",
      advertised: false,
      known: true,
      requiredBy: ["session/list"],
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
