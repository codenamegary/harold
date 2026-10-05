import { describe, expect, test } from "bun:test"
import net from "node:net"
import path from "node:path"
import { StatusSchema } from "contracts/http/status"
import {
  InternalProblemSchema,
  ProblemDetailsSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import { bootTestApp, disposeTestResources } from "./test-support/test.harness"

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

describe("GET /v1/status", () => {
  test("returns 200 with a StatusSchema payload", async () => {
    const { app } = await bootTestApp({
      config: { host: "127.0.0.1", port: 3847 },
      registerTestRoutes: true,
    })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/status",
    })
    const body = StatusSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.version).toBe("0.1.0")
    expect(body.state).toBe("starting")
    expect(body.bindAddress).toBe("127.0.0.1")
    expect(body.acp).toEqual({ state: "stopped", activeSessions: 0 })
    expect(body.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect("uptimeSeconds" in body).toBe(false)
  })
})

describe("bind and shutdown", () => {
  test("listens on loopback and releases the port after close", async () => {
    const result = await bootTestApp({
      config: { host: "127.0.0.1" },
      registerTestRoutes: true,
    })
    const { app, config, runtime } = result

    await app.listen({ host: config.host, port: config.port })
    runtime.setState("online")

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
    expect(result.database.path).toBe(path.join(result.dataDir, "harold.db"))

    await disposeTestResources()

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
    const { app } = await bootTestApp({ registerTestRoutes: true })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/_test/validate",
      payload: {},
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(response.headers["content-type"]).toStartWith("application/problem+json")
    expect(body.errors[0]?.pointer).toBe("#/name")
    expect(body.errors[0]?.code).toBe("validation.field.required")
  })

  test("internal errors return InternalProblemSchema as problem+json", async () => {
    const { app } = await bootTestApp({ registerTestRoutes: true })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/_test/error",
    })

    const body = InternalProblemSchema.parse(JSON.parse(response.body))
    ProblemDetailsSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(500)
    expect(response.headers["content-type"]).toStartWith("application/problem+json")
    expect(body.title).toBe("Internal server error")
  })
})
