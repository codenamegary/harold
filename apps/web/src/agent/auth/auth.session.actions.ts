import { AuthSessionAction } from "contracts/http/agent-auth"
import { AgentId } from "contracts/http/agent-settings"
import { applyAgentAuthSessionAction } from "./agent.auth"

/** Confirm or cancel an in-flight host-login session. */
export const confirmAgentAuthSession = (input: {
  agentId: AgentId
  sessionId: string
  stepId: string
}) =>
  applyAgentAuthSessionAction({
    agentId: input.agentId,
    sessionId: input.sessionId,
    action: { type: "confirm", stepId: input.stepId } satisfies AuthSessionAction,
  })

export const cancelAgentAuthSession = (input: {
  agentId: AgentId
  sessionId: string
}) =>
  applyAgentAuthSessionAction({
    agentId: input.agentId,
    sessionId: input.sessionId,
    action: { type: "cancel" } satisfies AuthSessionAction,
  })
