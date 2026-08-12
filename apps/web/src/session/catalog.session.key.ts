import { AgentId, AgentIdSchema } from "contracts/http/agent-settings"

export const catalogSessionKey = (params: {
  agentId: AgentId
  sessionId: string
}): string => `${params.agentId}:${params.sessionId}`

export const parseCatalogSessionKey = (
  value: string,
): { agentId: AgentId; sessionId: string } | null => {
  const separator = value.indexOf(":")
  if (separator <= 0 || separator === value.length - 1) {
    return null
  }

  const agentId = AgentIdSchema.safeParse(value.slice(0, separator))
  if (!agentId.success) {
    return null
  }

  return {
    agentId: agentId.data,
    sessionId: value.slice(separator + 1),
  }
}
