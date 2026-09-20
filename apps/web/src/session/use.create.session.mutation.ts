import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useSetAtom } from "jotai"
import { CreateSessionBody, SessionCollectionSchema } from "contracts/http/session"
import { queryKeys } from "../query/query.keys"
import { sessionConfigBySessionAtom } from "../chat/config/atoms"
import { createSession } from "./create.session"

export const useCreateSessionMutation = () => {
  const queryClient = useQueryClient()
  const setSessionConfig = useSetAtom(sessionConfigBySessionAtom)

  return useMutation({
    mutationFn: (body: CreateSessionBody) => createSession(body),
    onSuccess: async (created) => {
      // The create response carries the options the agent returned from ACP
      // session/new. Seed them so config controls work before the first
      // prompt; a later session_config frame overwrites this.
      setSessionConfig((current) => {
        const next = new Map(current)
        next.set(created.sessionId, created.configOptions)
        return next
      })

      queryClient.setQueriesData({ queryKey: queryKeys.sessionsRoot }, (existing: unknown) => {
        if (existing === undefined) {
          return existing
        }
        const collection = SessionCollectionSchema.parse(existing)
        const withoutCreated = collection.items.filter(
          (item) => item.sessionId !== created.sessionId,
        )
        const sessionRow = {
          agentId: created.agentId,
          sessionId: created.sessionId,
          cwd: created.cwd,
          title: created.title,
          updatedAt: created.updatedAt,
        }
        return SessionCollectionSchema.parse({
          items: [sessionRow, ...withoutCreated],
        })
      })

      await queryClient.invalidateQueries({ queryKey: queryKeys.sessionsRoot })
    },
  })
}
