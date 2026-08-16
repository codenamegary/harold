import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  SessionCollectionSchema,
  SessionDeleteTarget,
} from "contracts/http/session"
import { queryKeys } from "../query/query.keys"
import { deleteSessions } from "./delete.session"

export const useDeleteSessionsMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (items: ReadonlyArray<SessionDeleteTarget>) =>
      deleteSessions(items),
    onSuccess: async (result) => {
      const deletedKeys = new Set(
        result.deleted.map(
          (item) => `${item.agentId}\0${item.sessionId}`,
        ),
      )

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
                !deletedKeys.has(`${item.agentId}\0${item.sessionId}`),
            ),
          })
        },
      )

      await queryClient.invalidateQueries({ queryKey: queryKeys.sessionsRoot })
    },
  })
}
