import { defineConfig, Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import http from "node:http"
import net from "node:net"

const apiHost = "127.0.0.1"
const apiPort = Number(process.env.AGENT_SERVER_PORT ?? "3847")
const apiOrigin = `http://${apiHost}:${apiPort}`

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

const waitForApi = (): Plugin => ({
  name: "wait-for-api",
  configureServer: async () => {
    const reached = await waitForTcp(apiHost, apiPort, 20_000)
    if (!reached) {
      console.warn(
        `[vite] API is not listening on ${apiOrigin} yet. Proxied /v1 requests will fail until it is.`,
      )
    }
  },
})

export default defineConfig({
  plugins: [react(), tailwindcss(), waitForApi()],
  server: {
    proxy: {
      "/v1": {
        target: apiOrigin,
        changeOrigin: true,
        ws: true,
        agent: new http.Agent({ family: 4, keepAlive: false }),
      },
    },
  },
})
