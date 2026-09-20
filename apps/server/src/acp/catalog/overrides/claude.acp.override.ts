import { probeEnvOrWhich, AgentProfileOverride } from "../agent.profile.override"
import { PresenceProbe } from "../catalog.ports"

export const claudeAcpPresenceProbe: PresenceProbe = (ctx) =>
  probeEnvOrWhich(ctx, "CLAUDE_CODE_EXECUTABLE", "claude")

export const claudeAcpAgentProfileOverride: AgentProfileOverride = {
  presenceProbe: claudeAcpPresenceProbe,
}
