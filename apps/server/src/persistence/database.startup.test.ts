import { describe, expect, test } from "bun:test"
import net from "node:net"
import path from "node:path"
import { listen, registerShutdown } from "../bootstrap/shutdown"
import { bootTestApp } from "../test-support/test.harness"

describe("startup with database", () => {
  test("opens SQLite in a temp data dir before listening", async () => {
    const result = await bootTestApp({
      config: { host: "127.0.0.1" },
      registerTestRoutes: true,
    })
    const { app, database, config, acpSupervisor, runtimeStatusService } = result

    registerShutdown(app, database, acpSupervisor, runtimeStatusService, [])
    await listen(app, config, runtimeStatusService)

    const address = app.server.address()
    const port = typeof address === "object" && address !== null ? address.port : 0

    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.end()
        resolve(true)
      })
      socket.on("error", () => resolve(false))
    })

    expect(connected).toBe(true)
    expect(database.path).toBe(path.join(result.dataDir, "harold.db"))
  })
})
