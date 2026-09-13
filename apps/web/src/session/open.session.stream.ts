import {
  SessionStreamClientMessage,
  SessionStreamClientMessageSchema,
  SessionStreamServerMessage,
  SessionStreamServerMessageSchema,
} from "contracts/http/session.stream"

export type SessionStreamHandlers = {
  onMessage: (message: SessionStreamServerMessage) => void
  onClose?: () => void
  onError?: () => void
}

export type SessionStream = {
  send: (message: SessionStreamClientMessage) => void
  close: () => void
}

export const SESSIONS_STREAM_PATH = "/v1/sessions/stream"

const buildSessionsStreamUrl = () => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}${SESSIONS_STREAM_PATH}`
}

export const openSessionStream = (params: {
  handlers: SessionStreamHandlers
}): SessionStream => {
  const socket = new WebSocket(buildSessionsStreamUrl())
  const intentionalClose = { value: false }
  const queued: { values: ReadonlyArray<string> } = { values: [] }

  const flushQueue = () => {
    queued.values.forEach((value) => {
      socket.send(value)
    })
    queued.values = []
  }

  socket.addEventListener("open", () => {
    flushQueue()
  })

  socket.addEventListener("message", (message) => {
    const payload: unknown = JSON.parse(String(message.data))
    const parsed = SessionStreamServerMessageSchema.parse(payload)
    params.handlers.onMessage(parsed)
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
    send: (message) => {
      const parsed = SessionStreamClientMessageSchema.parse(message)
      const encoded = JSON.stringify(parsed)
      if (socket.readyState === 1) {
        socket.send(encoded)
        return
      }
      queued.values = [...queued.values, encoded]
    },
    close: () => {
      intentionalClose.value = true
      if (socket.readyState === socket.OPEN) socket.close()
    },
  }
}
