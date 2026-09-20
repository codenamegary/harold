import { probeWhich, AgentProfileOverride } from "../agent.profile.override"
import { PresenceProbe } from "../catalog.ports"

export const githubCopilotCliPresenceProbe: PresenceProbe = (ctx) => probeWhich(ctx, "copilot")

export const githubCopilotCliAgentProfileOverride: AgentProfileOverride = {
  presenceProbe: githubCopilotCliPresenceProbe,
}
