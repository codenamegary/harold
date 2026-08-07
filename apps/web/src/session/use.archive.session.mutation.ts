import { useMutation, useQueryClient } from "@tanstack/react-query"
import { SessionCollectionSchema } from "contracts/http/session"
import { queryKeys } from "../query/query.keys"
import { archiveSession } from "./archive.session"

export const useArchiveSessionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) => archiveSession(sessionId),
    onSuccess: (session) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.sessionsRoot },
        (existing: unknown) => {
          if (existing === undefined) {
            return existing
          }
          const collection = SessionCollectionSchema.parse(existing)
          const nextItems = collection.items.filter((item) => item.id !== session.id)
          return SessionCollectionSchema.parse({
            items: nextItems,
            page: {
              ...collection.page,
              count: nextItems.length,
            },
          })
        },
      )
    },
  })
}
