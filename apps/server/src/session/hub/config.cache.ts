import { AgentId } from "contracts/http/agent-settings"
import { SessionConfig } from "contracts/http/config.options"

/**
 * In-memory per-session config-options cache owned by the hub. Not a port: the
 * hub creates it and hands it to the routes that read and update it. Sessions
 * advertise config once (at create time, usually before anyone is subscribed),
 * so this is the copy a late stream subscriber gets.
 */
export type ConfigOptionsCache = {
  remember: (params: { agentId: AgentId; sessionId: string; configOptions: SessionConfig }) => void
  get: (params: { agentId: AgentId; sessionId: string }) => SessionConfig | undefined
  forget: (params: { agentId: AgentId; sessionId: string }) => void
}

const cacheKey = (agentId: AgentId, sessionId: string): string => `${agentId}:${sessionId}`

export const createConfigOptionsCache = (): ConfigOptionsCache => {
  const byKey = new Map<string, SessionConfig>()

  return {
    remember: ({ agentId, sessionId, configOptions }) => {
      byKey.set(cacheKey(agentId, sessionId), configOptions)
    },
    get: ({ agentId, sessionId }) => byKey.get(cacheKey(agentId, sessionId)),
    forget: ({ agentId, sessionId }) => {
      byKey.delete(cacheKey(agentId, sessionId))
    },
  }
}
