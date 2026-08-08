import {
  PresenceProbe,
  probeEnvOrWhich,
  AgentProfileOverride,
} from "../agent.profile.override"

export const codexAcpPresenceProbe: PresenceProbe = (ctx) =>
  probeEnvOrWhich(ctx, "CODEX_PATH", "codex")

export const codexAcpAgentProfileOverride: AgentProfileOverride = {
  presenceProbe: codexAcpPresenceProbe,
}
