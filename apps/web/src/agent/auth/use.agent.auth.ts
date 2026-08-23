import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AuthSessionAction } from "contracts/http/agent-auth"
import { AgentId } from "contracts/http/agent-settings"
import { queryKeys } from "../../query/query.keys"
import {
  applyAgentAuthSessionAction,
  fetchAgentAuth,
  logoutAgentAuth,
  startAgentAuthSession,
} from "./agent.auth"

const AUTH_POLL_MS = 1500

export const useAgentAuthQuery = (
  agentId: AgentId | null,
  options?: { pollWhileSessionActive?: boolean },
) => {
  const pollWhileSessionActive = options?.pollWhileSessionActive ?? false

  return useQuery({
    queryKey: agentId === null ? queryKeys.agentAuth("none") : queryKeys.agentAuth(agentId),
    queryFn: () => {
      if (agentId === null) {
        throw new Error("agentId required")
      }
      return fetchAgentAuth(agentId)
    },
    enabled: agentId !== null,
    refetchInterval: (query) => {
      if (!pollWhileSessionActive) {
        return false
      }
      const auth = query.state.data
      if (auth?.session?.status === "in_progress") {
        return AUTH_POLL_MS
      }
      return false
    },
  })
}

const invalidateAuthAndAgents = async (
  queryClient: ReturnType<typeof useQueryClient>,
  agentId: AgentId,
) => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.agentAuth(agentId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.agentSettingsRoot }),
  ])
}

export const useStartAgentAuthSessionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (agentId: AgentId) => startAgentAuthSession(agentId),
    onSettled: async (_data, _error, agentId) => {
      await invalidateAuthAndAgents(queryClient, agentId)
    },
  })
}

export const useAgentAuthSessionActionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      agentId: AgentId
      sessionId: string
      action: AuthSessionAction
    }) => applyAgentAuthSessionAction(input),
    onSettled: async (_data, _error, input) => {
      await invalidateAuthAndAgents(queryClient, input.agentId)
    },
  })
}

export const useLogoutAgentAuthMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (agentId: AgentId) => logoutAgentAuth(agentId),
    onSettled: async (_data, _error, agentId) => {
      await invalidateAuthAndAgents(queryClient, agentId)
    },
  })
}
