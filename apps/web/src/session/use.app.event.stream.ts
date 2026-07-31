import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Event } from "contracts/events/event"
import { SessionCollection } from "contracts/http/session"
import { queryKeys } from "../query/query.keys"
import { applySessionListEvents } from "./apply.list.events"
import { openAppEventStream } from "./open.app.event.stream"

export const APP_STREAM_RECONNECT_BASE_DELAY_MS = 250
export const APP_STREAM_RECONNECT_MAX_DELAY_MS = 4000

type UseAppEventStreamParams = {
  enabled: boolean
}

const reconnectDelayMs = (attempt: number): number =>
  Math.min(
    APP_STREAM_RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1),
    APP_STREAM_RECONNECT_MAX_DELAY_MS,
  )

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

    const disposed = { value: false }
    const activeStream = { current: null as ReturnType<typeof openAppEventStream> | null }
    const reconnectTimer = { current: null as ReturnType<typeof setTimeout> | null }
    const reconnectScheduled = { value: false }
    const reconnectAttempt = { value: 0 }

    const applyEvents = (events: ReadonlyArray<Event>) => {
      const client = queryClientRef.current
      const sessionQueries = client.getQueriesData<SessionCollection>({
        queryKey: queryKeys.sessionsRoot,
      })

      sessionQueries.forEach(([key, data]) => {
        if (data === undefined) {
          return
        }

        const next = applySessionListEvents({ collection: data, events })
        if (next !== data) {
          client.setQueryData(key, next)
        }
      })

      workspaceIdsFromCreatedEvents(events).forEach((workspaceId) => {
        void client.invalidateQueries({
          queryKey: queryKeys.sessions(workspaceId),
        })
      })
    }

    const connect = (isReconnect: boolean) => {
      if (disposed.value) {
        return
      }

      reconnectScheduled.value = false

      if (isReconnect) {
        void queryClientRef.current.invalidateQueries({
          queryKey: queryKeys.status,
        })
      }

      activeStream.current = openAppEventStream({
        handlers: {
          onEvents: (events) => {
            reconnectAttempt.value = 0
            applyEvents(events)
          },
          onClose: () => {
            scheduleReconnect()
          },
          onError: () => {
            scheduleReconnect()
          },
        },
      })
    }

    const scheduleReconnect = () => {
      if (disposed.value || reconnectScheduled.value) {
        return
      }

      reconnectScheduled.value = true
      activeStream.current?.close()
      activeStream.current = null
      reconnectAttempt.value += 1

      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current)
      }

      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null
        connect(true)
      }, reconnectDelayMs(reconnectAttempt.value))
    }

    connect(false)

    return () => {
      disposed.value = true
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current)
      }
      activeStream.current?.close()
    }
  }, [params.enabled])
}
