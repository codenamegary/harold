import { useMutation, useQueryClient } from "@tanstack/react-query"
import {
  CreateSessionBody,
  SessionCollectionSchema,
} from "contracts/http/session"
import { queryKeys } from "../query/query.keys"
import { createSession } from "./create.session"

export const useCreateSessionMutation = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateSessionBody) => createSession(body),
    onSuccess: async (session) => {
      const key = queryKeys.sessions(session.workspaceId)
      const existing = queryClient.getQueryData(key)
      if (existing !== undefined) {
        const collection = SessionCollectionSchema.parse(existing)
        const withoutCreated = collection.items.filter((item) => item.id !== session.id)
        const nextCount = withoutCreated.length + 1
        queryClient.setQueryData(
          key,
          SessionCollectionSchema.parse({
            items: [
              {
                id: session.id,
                workspaceId: session.workspaceId,
                agentId: session.agentId,
                name: session.name,
                state: session.state,
                createdAt: session.createdAt,
                lastUsedAt: session.lastUsedAt,
                archivedAt: session.archivedAt,
              },
              ...withoutCreated,
            ],
            page: {
              ...collection.page,
              count: nextCount,
            },
          }),
        )
      }

      await queryClient.invalidateQueries({ queryKey: key })
    },
  })
}
