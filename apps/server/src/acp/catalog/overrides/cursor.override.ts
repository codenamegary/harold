import { cursorExtensionHandlers } from "../../client/extensions/cursor"
import { AgentProfileOverride } from "../agent.profile.override"

export const cursorAgentProfileOverride: AgentProfileOverride = {
  command: ["agent", "acp"],
  authMethodId: "cursor_login",
  binaryName: "agent",
  extensionHandlers: cursorExtensionHandlers,
  clientCapabilities: {
    fs: {
      readTextFile: true,
      writeTextFile: true,
    },
    terminal: true,
  },
}
