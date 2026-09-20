import { AgentId } from "contracts/http/agent-settings"
import { AvailableCommandsUpdate } from "./commands.available"
import { CommandsCache } from "../session.ports"

const cacheKey = (agentId: AgentId, sessionId: string): string =>
  `${agentId}:${sessionId}`

export const createCommandsCache = (): CommandsCache => {
  const byKey = new Map<string, AvailableCommandsUpdate>()

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
