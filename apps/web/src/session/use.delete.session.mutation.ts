import { useMutation, useQueryClient } from "@tanstack/react-query"
import { AgentId } from "contracts/http/agent-settings"
import { SessionCollectionSchema } from "contracts/http/session"
import { queryKeys } from "../query/query.keys"
import { deleteSession } from "./delete.session"

export const useDeleteSessionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: { agentId: AgentId; sessionId: string }) =>
      deleteSession(params),
    onSuccess: async (_void, params) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.sessionsRoot },
        (existing: unknown) => {
          if (existing === undefined) {
            return existing
          }
          const collection = SessionCollectionSchema.parse(existing)
          return SessionCollectionSchema.parse({
            items: collection.items.filter(
              (item) =>
                item.sessionId !== params.sessionId ||
                item.agentId !== params.agentId,
            ),
          })
        },
      )

      await queryClient.invalidateQueries({ queryKey: queryKeys.sessionsRoot })
    },
  })
}
