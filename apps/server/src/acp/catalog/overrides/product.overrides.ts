import { AgentId } from "contracts/http/agent-settings"
import { AgentProfileOverride } from "../agent.profile.override"
import { auggieAgentProfileOverride } from "./auggie.override"
import { claudeAcpAgentProfileOverride } from "./claude.acp.override"
import { codexAcpAgentProfileOverride } from "./codex.acp.override"
import { cursorAgentProfileOverride } from "./cursor.override"
import { geminiAgentProfileOverride } from "./gemini.override"
import { githubCopilotCliAgentProfileOverride } from "./github.copilot.cli.override"
import { opencodeAgentProfileOverride } from "./opencode.override"
import { piAcpAgentProfileOverride } from "./pi.acp.override"

/**
 * Hand-maintained product overrides. Win over generated catalog defaults.
 * Codegen never writes this file.
 */
export const productAgentOverridesById: Partial<
  Record<AgentId, AgentProfileOverride>
> = {
  "cursor": cursorAgentProfileOverride,
  "claude-acp": claudeAcpAgentProfileOverride,
  "codex-acp": codexAcpAgentProfileOverride,
  "gemini": geminiAgentProfileOverride,
  "github-copilot-cli": githubCopilotCliAgentProfileOverride,
  "opencode": opencodeAgentProfileOverride,
  "pi-acp": piAcpAgentProfileOverride,
  "auggie": auggieAgentProfileOverride,
}
