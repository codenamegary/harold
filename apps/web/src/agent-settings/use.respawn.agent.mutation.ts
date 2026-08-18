import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AgentId } from "contracts/http/agent-settings"
import { queryKeys } from "../query/query.keys"
import { respawnAgent } from "./respawn.agent"

export const useRespawnAgentMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (agentId: AgentId) => respawnAgent(agentId),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.agentSettingsRoot })
    },
  })
}
