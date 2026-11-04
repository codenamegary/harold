import { DEMO_AGENT_DISPLAY_NAME, DEMO_AGENT_ID, DEMO_AGENT_PATH } from "./demo.constants"

export const demoRuntimeSettings = {
  settings: {
    bindPort: 8080,
    logLevel: "info" as const,
    logPath: null,
  },
  restartRequired: false,
  effective: {
    bindPort: 8080,
    logPath: null,
  },
  overrides: {},
}

const unknownAuthSummary = {
  status: "unknown" as const,
  error: null,
  activeSessionId: null,
  canLogout: false,
}

export const demoAgentSettings = {
  id: DEMO_AGENT_ID,
  displayName: DEMO_AGENT_DISPLAY_NAME,
  available: true,
  enabled: true,
  path: DEMO_AGENT_PATH,
  args: [] as string[],
  present: true,
  popular: true,
  deletable: false,
  state: {
    status: "ready" as const,
    error: null,
  },
  capabilities: null,
  authSummary: unknownAuthSummary,
}

export const demoAgentSettingsCollection = {
  items: [demoAgentSettings],
}

export const demoAgentAuth = {
  agentId: DEMO_AGENT_ID,
  status: "unknown" as const,
  error: null,
  session: null,
}
