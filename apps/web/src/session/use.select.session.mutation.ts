import { useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "../query/query.keys"
import { selectSession } from "./select.session"

export const useSelectSessionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) => selectSession(sessionId),
    onSuccess: async (session) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.sessions(session.workspaceId),
      })
    },
  })
}
