import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { createServer } from "./bootstrap/create-server"
import { listen, registerShutdown } from "./bootstrap/shutdown"
import { parseConfig } from "./config/config"
import { openDatabase } from "./persistence/open-database"
import { createRuntime } from "./runtime/runtime"

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-startup-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("startup with database", () => {
  test("opens SQLite in a temp data dir before listening", async () => {
    const dataDir = await createTempDataDir()
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const app = await createServer({
      config,
      runtime,
      registerTestRoutes: true,
    })

    registerShutdown(app, runtime, database, [])
    await listen(app, config, runtime)

    const address = app.server.address()
    const port =
      typeof address === "object" && address !== null ? address.port : 0

    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.end()
        resolve(true)
      })
      socket.on("error", () => resolve(false))
    })

    expect(connected).toBe(true)
    expect(database.path).toBe(path.join(dataDir, "agent-server.db"))

    await app.close()
    database.close()
  })
})
