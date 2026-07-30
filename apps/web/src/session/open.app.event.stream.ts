import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"

export type AppEventStreamHandlers = {
  onEvents: (events: ReadonlyArray<Event>) => void
}

export type AppEventStream = {
  close: () => void
}

const buildAppEventsUrl = () => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}/v1/events`
}

export const openAppEventStream = (params: {
  handlers: AppEventStreamHandlers
}): AppEventStream => {
  const socket = new WebSocket(buildAppEventsUrl())

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
