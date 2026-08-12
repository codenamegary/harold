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
      queryClient.setQueriesData(
        { queryKey: queryKeys.sessionsRoot },
        (existing: unknown) => {
          if (existing === undefined) {
            return existing
          }
          const collection = SessionCollectionSchema.parse(existing)
          const withoutCreated = collection.items.filter(
            (item) => item.sessionId !== session.sessionId,
          )
          return SessionCollectionSchema.parse({
            items: [session, ...withoutCreated],
          })
        },
      )

      await queryClient.invalidateQueries({ queryKey: queryKeys.sessionsRoot })
    },
  })
}
