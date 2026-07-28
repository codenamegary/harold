import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AgentId, UpdateAgentSettingsBody } from "contracts/http/agent-settings"
import { queryKeys } from "../query/queryKeys"
import { updateAgentSettings } from "./updateAgentSettings"

type UpdateAgentSettingsInput = {
  agentId: AgentId
  body: UpdateAgentSettingsBody
}

export const useUpdateAgentSettingsMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: UpdateAgentSettingsInput) => updateAgentSettings(input),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.agentSettingsRoot })
    },
  })
}
