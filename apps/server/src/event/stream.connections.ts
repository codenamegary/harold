import { WebSocket } from "ws"

const streamConnections = new Set<WebSocket>()

export const registerStreamConnection = (socket: WebSocket): (() => void) => {
  streamConnections.add(socket)
  return () => {
    streamConnections.delete(socket)
  }
}

export const closeAllStreamConnections = (): void => {
  streamConnections.forEach((socket) => {
    socket.close(1001, "server shutting down")
  })
  streamConnections.clear()
}
