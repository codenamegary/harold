import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  SessionCollectionSchema,
  UpdateSessionBody,
} from "contracts/http/session"
import { queryKeys } from "../query/query.keys"
import { updateSession } from "./update.session"

type UpdateSessionInput = {
  sessionId: string
  body: UpdateSessionBody
}

export const useUpdateSessionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ sessionId, body }: UpdateSessionInput) =>
      updateSession(sessionId, body),
    onSuccess: (session) => {
      queryClient.setQueriesData(
        { queryKey: queryKeys.sessionsRoot },
        (existing: unknown) => {
          if (existing === undefined) {
            return existing
          }
          const collection = SessionCollectionSchema.parse(existing)
          return SessionCollectionSchema.parse({
            items: collection.items.map((item) =>
              item.sessionId === session.id ? { ...item, title: session.name } : item,
            ),
          })
        },
      )
    },
  })
}
