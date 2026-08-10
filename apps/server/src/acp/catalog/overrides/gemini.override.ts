import { PresenceProbe, probeWhich, AgentProfileOverride } from "../agent.profile.override"

export const geminiPresenceProbe: PresenceProbe = (ctx) => probeWhich(ctx, "gemini")

export const geminiAgentProfileOverride: AgentProfileOverride = {
  presenceProbe: geminiPresenceProbe,
}
