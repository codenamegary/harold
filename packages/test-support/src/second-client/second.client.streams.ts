import { WebSocket } from "ws"

const defaultStreamTimeoutMs = 2_000

/** Opens the host session hub stream (presence attach path). Journal events are not replayed here. */
export const openHostEventStream = (wsUrl: string): Promise<{ ws: WebSocket }> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout opening host stream"))
    }, defaultStreamTimeoutMs)

    ws.on("open", () => {
      clearTimeout(timer)
      resolve({ ws })
    })

    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timer)
      reject(new Error(`unexpected response ${res.statusCode}`))
    })
  })

export const openDeviceEventStream = (params: {
  wsUrl: string
  credential: string
}): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(params.wsUrl, {
      headers: { authorization: `Bearer ${params.credential}` },
    })
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout opening device stream"))
    }, defaultStreamTimeoutMs)

    ws.on("open", () => {
      clearTimeout(timer)
      resolve(ws)
    })

    ws.on("unexpected-response", (_req, res) => {
      clearTimeout(timer)
      reject(new Error(`unexpected response ${res.statusCode}`))
    })
  })

export const waitForSocketClose = (
  ws: WebSocket,
): Promise<{ code: number; reason: string }> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout waiting for socket close"))
    }, defaultStreamTimeoutMs)

    ws.on("close", (code, reason) => {
      clearTimeout(timer)
      resolve({ code, reason: String(reason) })
    })

    if (ws.readyState === WebSocket.CLOSED) {
      clearTimeout(timer)
      reject(new Error("socket already closed before waitForSocketClose"))
    }
  })

export const closeWebSocket = (ws: WebSocket): Promise<void> =>
  new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve()
      return
    }
    ws.on("close", () => resolve())
    ws.close()
  })
