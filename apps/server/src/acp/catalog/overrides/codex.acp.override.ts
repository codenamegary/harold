import { probeEnvOrWhich, AgentProfileOverride } from "../agent.profile.override"
import { PresenceProbe } from "../catalog.ports"

export const codexAcpPresenceProbe: PresenceProbe = (ctx) =>
  probeEnvOrWhich(ctx, "CODEX_PATH", "codex")

export const codexAcpAgentProfileOverride: AgentProfileOverride = {
  presenceProbe: codexAcpPresenceProbe,
}
