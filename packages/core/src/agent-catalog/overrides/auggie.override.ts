import { probeWhich, AgentProfileOverride } from "../agent.profile.override"
import { PresenceProbe } from "../catalog.ports"

/**
 * Official ACP launch is `auggie --acp` (native CLI), not the registry npx package.
 * @see https://docs.augmentcode.com/cli/acp/agent
 */
export const auggiePresenceProbe: PresenceProbe = (ctx) => probeWhich(ctx, "auggie")

export const auggieAgentProfileOverride: AgentProfileOverride = {
  command: ["auggie", "--acp"],
  binaryName: "auggie",
  presenceProbe: auggiePresenceProbe,
}
