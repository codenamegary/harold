import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Event } from "contracts/events/event"
import { SessionCollectionSchema } from "contracts/http/session"
import { queryKeys } from "../query/query.keys"
import { applySessionListEvents } from "./apply.session.list.events"
import { openAppEventStream } from "./open.app.event.stream"

type UseAppEventStreamParams = {
  enabled: boolean
}

const workspaceIdsFromCreatedEvents = (
  events: ReadonlyArray<Event>,
): ReadonlyArray<string> =>
  [
    ...new Set(
      events.flatMap((event) =>
        event.type === "session.created" ? [event.payload.workspaceId] : [],
      ),
    ),
  ]

export const useAppEventStream = (params: UseAppEventStreamParams) => {
  const queryClient = useQueryClient()
  const queryClientRef = useRef(queryClient)

  useEffect(() => {
    queryClientRef.current = queryClient
  }, [queryClient])

  useEffect(() => {
    if (!params.enabled) {
      return
    }

    const stream = openAppEventStream({
      handlers: {
        onEvents: (events) => {
          const client = queryClientRef.current
          const sessionQueries = client.getQueriesData({
            queryKey: queryKeys.sessionsRoot,
          })

          sessionQueries.forEach(([key, data]) => {
            if (data === undefined) {
              return
            }

            const collection = SessionCollectionSchema.parse(data)
            const next = applySessionListEvents({ collection, events })
            if (next !== collection) {
              client.setQueryData(key, next)
            }
          })

          workspaceIdsFromCreatedEvents(events).forEach((workspaceId) => {
            void client.invalidateQueries({
              queryKey: queryKeys.sessions(workspaceId),
            })
          })
        },
      },
    })

    return () => {
      stream.close()
    }
  }, [params.enabled])
}
