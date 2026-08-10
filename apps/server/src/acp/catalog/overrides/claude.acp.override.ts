import {
  PresenceProbe,
  probeEnvOrWhich,
  AgentProfileOverride,
} from "../agent.profile.override"

export const claudeAcpPresenceProbe: PresenceProbe = (ctx) =>
  probeEnvOrWhich(ctx, "CLAUDE_CODE_EXECUTABLE", "claude")

export const claudeAcpAgentProfileOverride: AgentProfileOverride = {
  presenceProbe: claudeAcpPresenceProbe,
}
