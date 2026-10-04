import net from "node:net"
import index from "./index.html"

const apiHost = "127.0.0.1"
const apiPort = Number(process.env.HAROLD_PORT ?? "3847")
const apiOrigin = `http://${apiHost}:${apiPort}`
const webHost = "127.0.0.1"
const webPort = 5173

const waitForTcp = (host: string, port: number, timeoutMs: number): Promise<boolean> =>
  new Promise((resolve) => {
    const startedAt = Date.now()

    const attempt = () => {
      const socket = net.connect({ host, port, family: 4 }, () => {
        socket.end()
        resolve(true)
      })
      socket.on("error", () => {
        socket.destroy()
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false)
          return
        }
        setTimeout(attempt, 150)
      })
    }

    attempt()
  })

const reached = await waitForTcp(apiHost, apiPort, 20_000)
if (!reached) {
  console.warn(
    `[web] API is not listening on ${apiOrigin} yet. Proxied /v1 requests will fail until it is.`,
  )
}

type ProxyData = {
  target: string
  headers: Record<string, string>
}

type UpstreamState = {
  upstream: WebSocket | null
  queue: Array<string | Buffer>
}

const connections = new WeakMap<Bun.ServerWebSocket<ProxyData>, UpstreamState>()

const httpTarget = (req: Request) => {
  const url = new URL(req.url)
  return `${apiOrigin}${url.pathname}${url.search}`
}

const wsTarget = (req: Request) => httpTarget(req).replace(/^http/, "ws")

// Reserved codes (1005 no-status, 1006 abnormal, 1015 tls) describe how a
// socket closed but are invalid to send on the wire. Forward them as a
// code-less close instead of throwing InvalidAccessError.
const closeCodeToSend = (code: number): number | undefined => {
  if (code === 1005 || code === 1006 || code === 1015) {
    return undefined
  }
  const valid = (code >= 1000 && code <= 1014) || (code >= 3000 && code <= 4999)
  return valid ? code : undefined
}

const forwardHeaders = (req: Request): Record<string, string> => {
  const headers: Record<string, string> = {}
  const cookie = req.headers.get("cookie")
  const authorization = req.headers.get("authorization")
  if (cookie !== null) {
    headers.cookie = cookie
  }
  if (authorization !== null) {
    headers.authorization = authorization
  }
  return headers
}

const websocket: Bun.WebSocketHandler<ProxyData> = {
  idleTimeout: 0,
  open(ws) {
    const state: UpstreamState = { upstream: null, queue: [] }
    connections.set(ws, state)
    const upstream = new WebSocket(ws.data.target, { headers: ws.data.headers })
    state.upstream = upstream
    upstream.addEventListener("open", () => {
      for (const message of state.queue) {
        upstream.send(message)
      }
      state.queue = []
    })
    upstream.addEventListener("message", (event) => {
      ws.send(event.data)
    })
    upstream.addEventListener("close", (event) => {
      const code = closeCodeToSend(event.code)
      if (code === undefined) {
        ws.close()
        return
      }
      ws.close(code, event.reason)
    })
    upstream.addEventListener("error", () => {
      ws.close()
    })
  },
  message(ws, message) {
    const state = connections.get(ws)
    if (state === undefined) {
      return
    }
    if (state.upstream?.readyState === WebSocket.OPEN) {
      state.upstream.send(message)
      return
    }
    state.queue.push(message)
  },
  close(ws, code, reason) {
    const sendCode = closeCodeToSend(code)
    const upstream = connections.get(ws)?.upstream
    if (upstream === null || upstream === undefined) {
      connections.delete(ws)
      return
    }
    if (sendCode === undefined) {
      upstream.close()
    } else {
      upstream.close(sendCode, reason)
    }
    connections.delete(ws)
  },
}

Bun.serve({
  port: webPort,
  hostname: webHost,
  development: true,
  routes: {
    "/v1/*": async (req, server) => {
      const isUpgrade = req.headers.get("upgrade")?.toLowerCase() === "websocket"
      if (isUpgrade) {
        const upgraded = server.upgrade(req, {
          data: {
            target: wsTarget(req),
            headers: forwardHeaders(req),
          },
        })
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 500 })
        }
        return
      }
      return fetch(httpTarget(req), req)
    },
    "/": index,
    "/*": index,
  },
  websocket,
})

console.log(`[web] dev server listening on http://${webHost}:${webPort}`)
