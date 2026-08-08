import { PresenceProbe, probeWhich, AgentProfileOverride } from "../agent.profile.override"

export const auggiePresenceProbe: PresenceProbe = (ctx) => probeWhich(ctx, "auggie")

export const auggieAgentProfileOverride: AgentProfileOverride = {
  presenceProbe: auggiePresenceProbe,
}
