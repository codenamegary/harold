import { AgentId } from "contracts/http/agent-settings"
import { ForgetSessionTitle, GetSessionTitle, RememberSessionTitle } from "../session.ports"

/**
 * In-memory per-session title cache. The process root creates one and hands
 * each consumer only the port functions it needs.
 */
export type SessionTitleCache = Readonly<{
  getSessionTitle: GetSessionTitle
  rememberSessionTitle: RememberSessionTitle
  forgetSessionTitle: ForgetSessionTitle
}>

const cacheKey = (agentId: AgentId, sessionId: string): string => `${agentId}:${sessionId}`

export const createSessionTitleCache = (): SessionTitleCache => {
  const byKey = new Map<string, string>()

  return {
    getSessionTitle: ({ agentId, sessionId }) => byKey.get(cacheKey(agentId, sessionId)),
    rememberSessionTitle: ({ agentId, sessionId, title }) => {
      byKey.set(cacheKey(agentId, sessionId), title)
    },
    forgetSessionTitle: ({ agentId, sessionId }) => {
      byKey.delete(cacheKey(agentId, sessionId))
    },
  }
}
