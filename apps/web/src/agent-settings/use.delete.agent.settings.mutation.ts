import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AgentId } from "contracts/http/agent-settings"
import { queryKeys } from "../query/query.keys"
import { deleteAgentSettings } from "./delete.agent.settings"

export const useDeleteAgentSettingsMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (agentId: AgentId) => deleteAgentSettings(agentId),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.agentSettingsRoot })
    },
  })
}
