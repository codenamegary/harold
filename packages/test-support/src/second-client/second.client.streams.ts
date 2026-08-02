import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"
import { WebSocket } from "ws"

export type HostEventStream = {
  ws: WebSocket
  events: Event[]
  waitForType: (type: Event["type"], timeoutMs?: number) => Promise<Event>
}

const defaultStreamTimeoutMs = 2_000

export const openHostEventStream = (wsUrl: string): Promise<HostEventStream> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl}?cursor=0`)
    const events: Event[] = []
    const waiters: Array<{
      type: Event["type"]
      resolve: (event: Event) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }> = []

    const notify = (event: Event) => {
      events.push(event)
      const matched = waiters.filter((waiter) => waiter.type === event.type)
      for (const waiter of matched) {
        clearTimeout(waiter.timer)
        const index = waiters.indexOf(waiter)
        if (index >= 0) {
          waiters.splice(index, 1)
        }
        waiter.resolve(event)
      }
    }

    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout opening host stream"))
    }, defaultStreamTimeoutMs)

    ws.on("open", () => {
      clearTimeout(timer)
      resolve({
        ws,
        events,
        waitForType: (type, timeoutMs = defaultStreamTimeoutMs) =>
          new Promise((waitResolve, waitReject) => {
            const existing = events.find((event) => event.type === type)
            if (existing !== undefined) {
              waitResolve(existing)
              return
            }

            const waiterTimer = setTimeout(() => {
              waitReject(new Error(`timeout waiting for ${type}`))
            }, timeoutMs)
            waiters.push({
              type,
              resolve: waitResolve,
              reject: waitReject,
              timer: waiterTimer,
            })
          }),
      })
    })

    ws.on("message", (message) => {
      const frame = EventFrameSchema.parse(JSON.parse(String(message)))
      for (const event of frame) {
        notify(event)
      }
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
