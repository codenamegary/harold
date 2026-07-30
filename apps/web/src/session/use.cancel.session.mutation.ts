import { useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { cancelSession } from "./cancel.session"

export const useCancelSessionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) => cancelSession(sessionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessionsRoot })
    },
  })
}
