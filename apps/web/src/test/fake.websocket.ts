import { hrefOf } from "./request.url"

export type FakeSocket = {
  url: string
  readyState: number
  sent: string[]
  close: () => void
  send: (data: string) => void
  addEventListener: (type: string, listener: (event: { data?: string }) => void) => void
  dispatch: (type: string, data?: string) => void
}

export const createFakeSocket = (url: string): FakeSocket => {
  const listeners = new Map<string, Array<(event: { data?: string }) => void>>()

  const socket: FakeSocket = {
    url,
    readyState: 1,
    sent: [],
    close: () => {
      socket.readyState = 3
      const current = listeners.get("close") ?? []
      current.forEach((listener) => listener({}))
    },
    send: (data) => {
      socket.sent.push(data)
    },
    addEventListener: (type, listener) => {
      const current = listeners.get(type) ?? []
      listeners.set(type, [...current, listener])
    },
    dispatch: (type, data) => {
      const current = listeners.get(type) ?? []
      current.forEach((listener) => listener({ data }))
    },
  }

  return socket
}

export const installFakeWebSocket = (sockets: FakeSocket[]) => {
  const originalWebSocket = globalThis.WebSocket

  globalThis.WebSocket = function FakeWebSocket(url: string | URL) {
    const socket = createFakeSocket(hrefOf(url))
    sockets.push(socket)
    return socket
  } as unknown as typeof WebSocket

  return () => {
    globalThis.WebSocket = originalWebSocket
  }
}

export const sentStreamMessages = (socket: FakeSocket | undefined) =>
  (socket?.sent ?? []).flatMap((value) => {
    const parsed: unknown = JSON.parse(value)
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("type" in parsed) ||
      typeof parsed.type !== "string"
    ) {
      return []
    }
    return [{ type: parsed.type }]
  })
