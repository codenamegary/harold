import { useEffect, useRef } from "react"
import { Event } from "contracts/events/event"
import { openSessionEventStream } from "./open.session.event.stream"

export const SESSION_STREAM_RECONNECT_DELAY_MS = 250

type UseSessionEventStreamParams = {
  sessionId: string | null
  enabled: boolean
  onEvents: (events: ReadonlyArray<Event>) => void
  onReconnect?: () => void
}

const lastCursorFromEvents = (events: ReadonlyArray<Event>): number | null => {
  const last = events[events.length - 1]
  if (last === undefined) {
    return null
  }
  return Number(last.cursor)
}

export const useSessionEventStream = (params: UseSessionEventStreamParams) => {
  const onEventsRef = useRef(params.onEvents)
  const onReconnectRef = useRef(params.onReconnect)
  const durableCursorRef = useRef(0)

  useEffect(() => {
    onEventsRef.current = params.onEvents
  }, [params.onEvents])

  useEffect(() => {
    onReconnectRef.current = params.onReconnect
  }, [params.onReconnect])

  useEffect(() => {
    if (!params.enabled || params.sessionId === null) {
      return
    }

    const sessionId = params.sessionId
    const disposed = { value: false }
    const activeStream = { current: null as ReturnType<typeof openSessionEventStream> | null }
    const reconnectTimer = { current: null as ReturnType<typeof setTimeout> | null }
    const reconnectScheduled = { value: false }

    durableCursorRef.current = 0
    onReconnectRef.current?.()

    const connect = (cursor: number) => {
      if (disposed.value) {
        return
      }

      reconnectScheduled.value = false

      activeStream.current = openSessionEventStream({
        sessionId,
        cursor,
        handlers: {
          onEvents: (events) => {
            const nextCursor = lastCursorFromEvents(events)
            if (nextCursor !== null) {
              durableCursorRef.current = nextCursor
            }
            onEventsRef.current(events)
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

      // Clear local transcript. Full journal replay from 0 is the correct rebuild
      // after clear. Durable cursor is tracked for live append until disconnect.
      onReconnectRef.current?.()
      durableCursorRef.current = 0

      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current)
      }

      reconnectTimer.current = setTimeout(() => {
        reconnectTimer.current = null
        connect(0)
      }, SESSION_STREAM_RECONNECT_DELAY_MS)
    }

    connect(0)

    return () => {
      disposed.value = true
      if (reconnectTimer.current !== null) {
        clearTimeout(reconnectTimer.current)
      }
      activeStream.current?.close()
    }
  }, [params.enabled, params.sessionId])
}
