import { AgentId } from "contracts/http/agent-settings"
import { UsageUpdate } from "./usage.update"

/**
 * In-memory per-session context-usage cache owned by the hub. Agents do not
 * replay `usage_update` on `session/load`, so this is the copy a subscriber
 * gets when switching back to a chat or starting a full replay.
 */
export type UsageCache = {
  remember: (params: { agentId: AgentId; sessionId: string; update: UsageUpdate }) => void
  get: (params: { agentId: AgentId; sessionId: string }) => UsageUpdate | undefined
  forget: (params: { agentId: AgentId; sessionId: string }) => void
}

const cacheKey = (agentId: AgentId, sessionId: string): string => `${agentId}:${sessionId}`

export const createUsageCache = (): UsageCache => {
  const byKey = new Map<string, UsageUpdate>()

  return {
    remember: ({ agentId, sessionId, update }) => {
      byKey.set(cacheKey(agentId, sessionId), update)
    },
    get: ({ agentId, sessionId }) => byKey.get(cacheKey(agentId, sessionId)),
    forget: ({ agentId, sessionId }) => {
      byKey.delete(cacheKey(agentId, sessionId))
    },
  }
}
