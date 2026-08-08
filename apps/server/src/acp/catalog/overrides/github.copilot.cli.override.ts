import { PresenceProbe, probeWhich, AgentProfileOverride } from "../agent.profile.override"

export const githubCopilotCliPresenceProbe: PresenceProbe = (ctx) =>
  probeWhich(ctx, "copilot")

export const githubCopilotCliAgentProfileOverride: AgentProfileOverride = {
  presenceProbe: githubCopilotCliPresenceProbe,
}
