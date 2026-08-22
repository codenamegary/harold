import { AgentId } from "contracts/http/agent-settings"
import { SessionOwnership } from "./models"

export const createSessionOwnership = (): SessionOwnership => {
  const ownersByAcpSessionId = new Map<string, AgentId>()

  return {
    remember: ({ agentId, acpSessionId }) => {
      ownersByAcpSessionId.set(acpSessionId, agentId)
    },
    forget: ({ acpSessionId }) => {
      ownersByAcpSessionId.delete(acpSessionId)
    },
    ownerOf: (acpSessionId) => ownersByAcpSessionId.get(acpSessionId),
    sessionsOwnedBy: (agentId) =>
      [...ownersByAcpSessionId.entries()]
        .flatMap(([acpSessionId, ownerAgentId]) =>
          ownerAgentId === agentId ? [acpSessionId] : [],
        ),
  }
}
