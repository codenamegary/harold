import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AgentId, UpdateAgentSettingsBody } from "contracts/http/agent-settings"
import { queryKeys } from "../query/query.keys"
import { updateAgentSettings } from "./update.agent.settings"

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
