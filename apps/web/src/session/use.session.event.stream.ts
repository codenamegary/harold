import { useEffect, useRef } from "react"
import { Event } from "contracts/events/event"
import { openSessionEventStream } from "./open.session.event.stream"

type UseSessionEventStreamParams = {
  sessionId: string | null
  enabled: boolean
  onEvents: (events: ReadonlyArray<Event>) => void
  onReconnect?: () => void
}

export const useSessionEventStream = (params: UseSessionEventStreamParams) => {
  const onEventsRef = useRef(params.onEvents)
  const onReconnectRef = useRef(params.onReconnect)

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
    onReconnectRef.current?.()

    const stream = openSessionEventStream({
      sessionId,
      cursor: 0,
      handlers: {
        onEvents: (events) => {
          onEventsRef.current(events)
        },
      },
    })

    return () => {
      stream.close()
    }
  }, [params.enabled, params.sessionId])
}
