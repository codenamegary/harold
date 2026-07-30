import { useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { promptSession, PromptSessionParams } from "./prompt.session"

export const usePromptSessionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: PromptSessionParams) => promptSession(params),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessionsRoot })
    },
  })
}
