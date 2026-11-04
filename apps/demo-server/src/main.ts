import { startDemoServer } from "./server"

const portValue = Bun.env.PORT ?? "8080"
const port = Number(portValue)
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  console.error(`Invalid PORT value: ${portValue}`)
  process.exit(1)
}

const hostname = Bun.env.HOST ?? "0.0.0.0"
const started = startDemoServer({ hostname, port })

console.log(`harold demo server listening on http://${hostname}:${started.server.port}`)

const shutdown = (): void => {
  started.stop()
  process.exit(0)
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
