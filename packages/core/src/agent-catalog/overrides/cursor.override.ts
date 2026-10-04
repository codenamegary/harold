import { AgentProfileOverride } from "../agent.profile.override"

export const cursorAgentProfileOverride: AgentProfileOverride = {
  command: ["agent", "acp"],
  authMethodId: "cursor_login",
  binaryName: "agent",
  clientCapabilities: {
    fs: {
      readTextFile: true,
      writeTextFile: true,
    },
    terminal: true,
    _meta: {
      parameterizedModelPicker: true,
    },
  },
}
