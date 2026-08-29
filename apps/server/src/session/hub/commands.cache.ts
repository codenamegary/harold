import { AgentId } from "contracts/http/agent-settings"
import { AvailableCommandsUpdate } from "./commands.available"

export type CommandsCache = {
  remember: (params: {
    agentId: AgentId
    sessionId: string
    update: AvailableCommandsUpdate
  }) => void
  get: (params: {
    agentId: AgentId
    sessionId: string
  }) => AvailableCommandsUpdate | undefined
  forget: (params: { agentId: AgentId; sessionId: string }) => void
}

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
