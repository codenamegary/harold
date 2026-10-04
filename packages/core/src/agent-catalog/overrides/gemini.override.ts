import { probeWhich, AgentProfileOverride } from "../agent.profile.override"
import { PresenceProbe } from "../catalog.ports"

export const geminiPresenceProbe: PresenceProbe = (ctx) => probeWhich(ctx, "gemini")

export const geminiAgentProfileOverride: AgentProfileOverride = {
  presenceProbe: geminiPresenceProbe,
}
