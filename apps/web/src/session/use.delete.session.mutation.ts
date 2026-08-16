import { useMutation, useQueryClient, QueryClient } from "@tanstack/react-query"
import {
  SessionCollectionSchema,
  SessionDeleteTarget,
} from "contracts/http/session"
import { queryKeys } from "../query/query.keys"
import {
  deleteSessions,
  DeleteSessionsSettledEvent,
} from "./delete.session"

export type DeleteSessionsMutationVariables = {
  items: ReadonlyArray<SessionDeleteTarget>
  signal?: AbortSignal
  onSettled?: (event: DeleteSessionsSettledEvent) => void
}

const dropSessionFromCache = (
  queryClient: QueryClient,
  item: SessionDeleteTarget,
) => {
  const key = `${item.agentId}\0${item.sessionId}`
  queryClient.setQueriesData(
    { queryKey: queryKeys.sessionsRoot },
    (existing: unknown) => {
      if (existing === undefined) {
        return existing
      }
      const collection = SessionCollectionSchema.parse(existing)
      return SessionCollectionSchema.parse({
        items: collection.items.filter(
          (row) => `${row.agentId}\0${row.sessionId}` !== key,
        ),
      })
    },
  )
}

export const useDeleteSessionsMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (variables: DeleteSessionsMutationVariables) =>
      deleteSessions(variables.items, {
        signal: variables.signal,
        onSettled: (event) => {
          if (variables.signal?.aborted) {
            return
          }
          if (event.ok) {
            dropSessionFromCache(queryClient, event.item)
          }
          variables.onSettled?.(event)
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.sessionsRoot })
    },
  })
}
