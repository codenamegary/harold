import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"

export type SessionEventStreamHandlers = {
  onEvents: (events: ReadonlyArray<Event>) => void
}

export type SessionEventStream = {
  close: () => void
}

const buildEventsUrl = (params: { sessionId: string; cursor: number }) => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  const search = new URLSearchParams({
    sessionId: params.sessionId,
    cursor: String(params.cursor),
  })
  return `${protocol}//${window.location.host}/v1/events?${search.toString()}`
}

export const openSessionEventStream = (params: {
  sessionId: string
  cursor: number
  handlers: SessionEventStreamHandlers
}): SessionEventStream => {
  const socket = new WebSocket(
    buildEventsUrl({ sessionId: params.sessionId, cursor: params.cursor }),
  )

  socket.addEventListener("message", (message) => {
    const payload: unknown = JSON.parse(String(message.data))
    const frame = EventFrameSchema.parse(payload)
    params.handlers.onEvents(frame)
  })

  return {
    close: () => {
      socket.close()
    },
  }
}
