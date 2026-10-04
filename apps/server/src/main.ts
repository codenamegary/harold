#!/usr/bin/env bun
import { runServer } from "./bootstrap/run.server"

runServer().catch((error: unknown) => {
  console.error({ err: error }, "harold failed to start")
  process.exit(1)
})
