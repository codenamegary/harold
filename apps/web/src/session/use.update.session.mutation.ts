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
      const key = queryKeys.sessions(session.workspaceId)
      const existing = queryClient.getQueryData(key)
      if (existing !== undefined) {
        const collection = SessionCollectionSchema.parse(existing)
        queryClient.setQueryData(
          key,
          SessionCollectionSchema.parse({
            items: collection.items.map((item) =>
              item.id === session.id ? session : item,
            ),
            page: collection.page,
          }),
        )
      }
    },
  })
}
