import { runServer } from "./bootstrap/run.server"

runServer().catch((error: unknown) => {
  console.error({ err: error }, "agent server failed to start")
  process.exit(1)
})
