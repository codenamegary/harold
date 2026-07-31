import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"

export type AppEventStreamHandlers = {
  onEvents: (events: ReadonlyArray<Event>) => void
  onClose?: () => void
  onError?: () => void
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

  const intentionalClose = { value: false }

  socket.addEventListener("message", (message) => {
    const payload: unknown = JSON.parse(String(message.data))
    const frame = EventFrameSchema.parse(payload)
    params.handlers.onEvents(frame)
  })

  socket.addEventListener("close", () => {
    if (intentionalClose.value) {
      return
    }
    params.handlers.onClose?.()
  })

  socket.addEventListener("error", () => {
    if (intentionalClose.value) {
      return
    }
    params.handlers.onError?.()
  })

  return {
    close: () => {
      intentionalClose.value = true
      socket.close()
    },
  }
}
