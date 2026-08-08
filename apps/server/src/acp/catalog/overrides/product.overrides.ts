import { AgentId } from "contracts/http/agent-settings"
import { AgentProfileOverride } from "../agent.profile.override"
import { cursorAgentProfileOverride } from "./cursor.override"

/**
 * Hand-maintained product overrides. Win over generated catalog defaults.
 * Codegen never writes this file.
 */
export const productAgentOverridesById: Partial<
  Record<AgentId, AgentProfileOverride>
> = {
  cursor: cursorAgentProfileOverride,
}
