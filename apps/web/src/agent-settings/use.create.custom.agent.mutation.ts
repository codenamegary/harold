import { useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { createCustomAgent } from "./create.custom.agent"

export const useCreateCustomAgentMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createCustomAgent,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.agentSettingsRoot })
    },
  })
}
