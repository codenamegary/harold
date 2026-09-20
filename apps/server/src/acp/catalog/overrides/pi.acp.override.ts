import { probeWhich, AgentProfileOverride } from "../agent.profile.override"
import { PresenceProbe } from "../catalog.ports"

/**
 * Pi's host CLI is commonly installed as `pi`. Presence uses that binary;
 * catalog spawn remains the npx ACP adapter until a product command override exists.
 */
export const piAcpPresenceProbe: PresenceProbe = (ctx) => probeWhich(ctx, "pi")

export const piAcpAgentProfileOverride: AgentProfileOverride = {
  presenceProbe: piAcpPresenceProbe,
}
