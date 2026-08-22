import { AgentId } from "contracts/http/agent-settings"

export type SessionOwnership = {
  remember: (params: { agentId: AgentId; acpSessionId: string }) => void
  forget: (params: { acpSessionId: string }) => void
  ownerOf: (acpSessionId: string) => AgentId | undefined
  sessionsOwnedBy: (agentId: AgentId) => ReadonlyArray<string>
}

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
