import { afterEach, describe, expect, test } from "bun:test"
import net from "node:net"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { StatusSchema } from "contracts/http/status"
import {
  InternalProblemSchema,
  ProblemDetailsSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import { createServer } from "./bootstrap/create-server"
import { parseConfig } from "./config/config"
import { openDatabase } from "./persistence/open-database"
import { createRuntime } from "./runtime/runtime"

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-integration-"))
  tempDirs.push(dir)
  return dir
}

const createTestServer = async (port = 0) => {
  const dataDir = await createTempDataDir()
  const config = parseConfig({
    AGENT_SERVER_HOST: "127.0.0.1",
    AGENT_SERVER_PORT: String(port),
    AGENT_SERVER_DATA_DIR: dataDir,
  })
  const database = openDatabase({ dataDir: config.dataDir })
  const runtime = createRuntime("0.1.0")
  const app = await createServer({
    config,
    runtime,
    database,
    registerTestRoutes: true,
  })
  return { app, database, config, runtime }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("GET /v1/status", () => {
  test("returns 200 with a StatusSchema payload", async () => {
    const { app } = await createTestServer(3847)

    const response = await app.inject({ method: "GET", url: "/v1/status" })
    const body = StatusSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.version).toBe("0.1.0")
    expect(body.state).toBe("starting")
    expect(body.bindAddress).toBe("127.0.0.1")
    expect(body.acp).toEqual({ state: "stopped", activeSessions: 0 })
    expect(body.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect("uptimeSeconds" in body).toBe(false)

    await app.close()
  })
})

describe("bind and shutdown", () => {
  const apps: Awaited<ReturnType<typeof createServer>>[] = []

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
  })

  test("listens on loopback and releases the port after close", async () => {
    const { app, config, database, runtime } = await createTestServer(0)
    apps.push(app)

    await app.listen({ host: config.host, port: config.port })
    runtime.setState("online")

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

    await app.close()
    database.close()

    const portReleased = await new Promise<boolean>((resolve) => {
      const probe = net.createServer()
      probe.once("error", () => resolve(false))
      probe.listen({ host: "127.0.0.1", port }, () => {
        probe.close(() => resolve(true))
      })
    })

    expect(portReleased).toBe(true)
  })
})

describe("error responses", () => {
  test("validation errors return ValidationProblemSchema as problem+json", async () => {
    const { app } = await createTestServer()

    const response = await app.inject({
      method: "POST",
      url: "/v1/_test/validate",
      payload: {},
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(response.headers["content-type"]).toStartWith("application/problem+json")
    expect(body.errors[0]?.pointer).toBe("#/name")
    expect(body.errors[0]?.code).toBe("validation.field.required")

    await app.close()
  })

  test("internal errors return InternalProblemSchema as problem+json", async () => {
    const { app } = await createTestServer()

    const response = await app.inject({
      method: "GET",
      url: "/v1/_test/error",
    })

    const body = InternalProblemSchema.parse(JSON.parse(response.body))
    ProblemDetailsSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(500)
    expect(response.headers["content-type"]).toStartWith("application/problem+json")
    expect(body.title).toBe("Internal server error")

    await app.close()
  })
})
