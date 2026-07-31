import { useMutation, useQueryClient } from "@tanstack/react-query"
import { SessionCollectionSchema } from "contracts/http/session"
import { queryKeys } from "../query/query.keys"
import { archiveSession } from "./archive.session"

export const useArchiveSessionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (sessionId: string) => archiveSession(sessionId),
    onSuccess: (session) => {
      const key = queryKeys.sessions(session.workspaceId)
      const existing = queryClient.getQueryData(key)
      if (existing !== undefined) {
        const collection = SessionCollectionSchema.parse(existing)
        const nextItems = collection.items.filter((item) => item.id !== session.id)
        queryClient.setQueryData(
          key,
          SessionCollectionSchema.parse({
            items: nextItems,
            page: {
              ...collection.page,
              count: nextItems.length,
            },
          }),
        )
      }
    },
  })
}
