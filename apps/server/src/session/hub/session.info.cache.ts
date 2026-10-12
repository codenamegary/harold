import { AgentId } from "contracts/http/agent-settings"

/**
 * In-memory per-session title cache owned by the hub. Not a port: the hub
 * creates it and hands it to the routes that read and update it.
 */
export type SessionInfoCache = {
  remember: (params: { agentId: AgentId; sessionId: string; title: string }) => void
  get: (params: { agentId: AgentId; sessionId: string }) => string | undefined
  forget: (params: { agentId: AgentId; sessionId: string }) => void
}

const cacheKey = (agentId: AgentId, sessionId: string): string => `${agentId}:${sessionId}`

export const createSessionInfoCache = (): SessionInfoCache => {
  const byKey = new Map<string, string>()

  return {
    remember: ({ agentId, sessionId, title }) => {
      byKey.set(cacheKey(agentId, sessionId), title)
    },
    get: ({ agentId, sessionId }) => byKey.get(cacheKey(agentId, sessionId)),
    forget: ({ agentId, sessionId }) => {
      byKey.delete(cacheKey(agentId, sessionId))
    },
  }
}
