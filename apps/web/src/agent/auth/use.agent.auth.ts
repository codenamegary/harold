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

const invalidateAuthAndAgents = (
  queryClient: ReturnType<typeof useQueryClient>,
  agentId: AgentId,
) => {
  void queryClient.invalidateQueries({ queryKey: queryKeys.agentAuth(agentId) })
  // Agents list probes every adapter; do not block mutation pending on it.
  void queryClient.invalidateQueries({ queryKey: queryKeys.agentSettingsRoot })
}

export const useStartAgentAuthSessionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (agentId: AgentId) => startAgentAuthSession(agentId),
    onSuccess: (session, agentId) => {
      queryClient.setQueryData(queryKeys.agentAuth(agentId), {
        agentId,
        status: "needs_auth" as const,
        error: null,
        session,
      })
      invalidateAuthAndAgents(queryClient, agentId)
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
    onSuccess: (session, input) => {
      queryClient.setQueryData(queryKeys.agentAuth(input.agentId), {
        agentId: input.agentId,
        status: session.status === "succeeded" ? ("unknown" as const) : ("needs_auth" as const),
        error: session.error,
        session: session.status === "in_progress" ? session : null,
      })
      invalidateAuthAndAgents(queryClient, input.agentId)
    },
  })
}

export const useLogoutAgentAuthMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (agentId: AgentId) => logoutAgentAuth(agentId),
    onSuccess: (_summary, agentId) => {
      invalidateAuthAndAgents(queryClient, agentId)
    },
  })
}
