import { describe, expect, test } from "bun:test"
import { UnauthorizedProblemSchema } from "contracts/http/error"
import {
  ClaimPairingCodeResponseSchema,
  CreatePairingCodeResponseSchema,
  PAIRING_CODES_PATH,
  claimPairingCodePath,
} from "contracts/http/pairing-code"
import { eq } from "drizzle-orm"
import { WebSocket } from "ws"
import { bootTestApp, seedTestDevice } from "../test-support/test.harness"
import { devices } from "../persistence/schema/devices"
import { Config } from "../config/config"
import { BEARER_CHALLENGE } from "./problems"

const getListeningHttpBase = async (
  app: {
    listen: (opts: { host: string; port: number }) => Promise<string>
    server: { address: () => unknown }
  },
  config: Config,
) => {
  await app.listen({ host: config.host, port: 0 })
  const address = app.server.address()
  if (address === null || typeof address === "string") {
    throw new Error("expected bound server address")
  }

  return {
    httpBase: `http://${config.host}:${address.port}`,
    wsUrl: `ws://${config.host}:${address.port}/v1/sessions/stream`,
  }
}

const authHeaders = (credential: string) => ({ authorization: `Bearer ${credential}` })

const createPairingCode = async (httpBase: string, credential: string) => {
  const createResponse = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(credential) },
    body: JSON.stringify({}),
  })
  expect(createResponse.status).toBe(201)
  return CreatePairingCodeResponseSchema.parse(await createResponse.json())
}

const websocketUpgradeHeaders = {
  connection: "upgrade",
  upgrade: "websocket",
  "sec-websocket-version": "13",
  "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
}

const expectUnauthorized = async (response: Response) => {
  expect(response.status).toBe(401)
  expect(response.headers.get("www-authenticate")).toBe(BEARER_CHALLENGE)
  expect(response.headers.get("content-type")).toContain("application/problem+json")
  const problem = UnauthorizedProblemSchema.parse(await response.json())
  expect(problem.status).toBe(401)
}

const waitForCloseCode = (wsUrl: string) =>
  new Promise<number>((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout waiting for close"))
    }, 2_000)

    ws.addEventListener("close", (event) => {
      clearTimeout(timer)
      resolve(event.code)
    })

    ws.addEventListener("unexpected-response", (_req, res) => {
      clearTimeout(timer)
      reject(new Error(`unexpected response ${res.statusCode}`))
    })
  })

const waitForOpen = (wsUrl: string, headers?: Record<string, string>) =>
  new Promise<boolean>((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { headers })
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout waiting for open"))
    }, 2_000)
    ws.addEventListener("open", () => {
      clearTimeout(timer)
      ws.close()
      resolve(true)
    })
    ws.addEventListener("unexpected-response", (_req, res) => {
      clearTimeout(timer)
      reject(new Error(`unexpected response ${res.statusCode}`))
    })
  })

describe("device-only HTTP edge", () => {
  test("unauthenticated request on loopback is rejected on protected routes", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningHttpBase(app, config)

    await expectUnauthorized(await fetch(`${httpBase}/v1/workspaces`))
    await expectUnauthorized(await fetch(`${httpBase}/v1/sessions`))
    await expectUnauthorized(await fetch(`${httpBase}/v1/settings/agents`))
    await expectUnauthorized(
      await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    )
  })

  test("valid device Bearer unlocks operator HTTP", async () => {
    const { app, config, database } = await bootTestApp()
    const { httpBase } = await getListeningHttpBase(app, config)
    const { credential } = seedTestDevice(database)

    const response = await fetch(`${httpBase}/v1/workspaces`, { headers: authHeaders(credential) })
    expect(response.status).toBe(200)
  })

  test("bad Bearer returns 401 with Bearer challenge", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningHttpBase(app, config)

    const response = await fetch(`${httpBase}/v1/workspaces`, {
      headers: { authorization: "Bearer not-a-real-credential" },
    })

    await expectUnauthorized(response)
  })

  test("revoked device credential returns 401", async () => {
    const { app, config, database } = await bootTestApp()
    const { httpBase } = await getListeningHttpBase(app, config)
    const { deviceId, credential } = seedTestDevice(database)

    database.db
      .update(devices)
      .set({ revokedAt: "2026-08-02T12:00:00.000Z" })
      .where(eq(devices.id, deviceId))
      .run()

    const response = await fetch(`${httpBase}/v1/workspaces`, { headers: authHeaders(credential) })

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe(BEARER_CHALLENGE)
  })

  test("status stays open without Bearer", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningHttpBase(app, config)

    const response = await fetch(`${httpBase}/v1/status`)
    expect(response.status).toBe(200)
  })

  test("pairing claim stays open without Bearer", async () => {
    const { app, config, database } = await bootTestApp()
    const { httpBase } = await getListeningHttpBase(app, config)
    const { credential } = seedTestDevice(database)
    const created = await createPairingCode(httpBase, credential)

    const claimResponse = await fetch(`${httpBase}${claimPairingCodePath(created.code)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Claimed without credential" }),
    })
    expect(claimResponse.status).toBe(201)
    ClaimPairingCodeResponseSchema.parse(await claimResponse.json())
  })
})

describe("device auth WebSocket", () => {
  test("loopback without Bearer and without auth frame fails closed", async () => {
    const { app, config } = await bootTestApp({ wsAuthFrameTimeoutMs: 200 })
    const { wsUrl } = await getListeningHttpBase(app, config)

    expect(await waitForCloseCode(wsUrl)).toBe(1008)
  })

  test("Upgrade Authorization Bearer unlocks event stream", async () => {
    const { app, config, database } = await bootTestApp()
    const { wsUrl } = await getListeningHttpBase(app, config)
    const { credential } = seedTestDevice(database)

    expect(await waitForOpen(wsUrl, authHeaders(credential))).toBe(true)
  })

  test("bad Upgrade Bearer rejects with 401 challenge", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningHttpBase(app, config)

    const response = await fetch(`${httpBase}/v1/sessions/stream`, {
      headers: {
        ...websocketUpgradeHeaders,
        authorization: "Bearer bad-credential",
      },
    })

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe(BEARER_CHALLENGE)
    UnauthorizedProblemSchema.parse(await response.json())
  })

  test("first-message auth frame unlocks stream", async () => {
    const { app, config, database } = await bootTestApp({ wsAuthFrameTimeoutMs: 2_000 })
    const { wsUrl } = await getListeningHttpBase(app, config)
    const { credential } = seedTestDevice(database)

    const opened = await new Promise<boolean>((resolve, reject) => {
      const ws = new WebSocket(wsUrl)
      const timer = setTimeout(() => {
        ws.close()
        reject(new Error("timeout waiting for auth"))
      }, 2_000)

      ws.addEventListener("open", () => {
        ws.send(
          JSON.stringify({
            type: "auth",
            authorization: `Bearer ${credential}`,
          }),
        )
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            clearTimeout(timer)
            ws.close()
            resolve(true)
          }
        }, 100)
      })

      ws.addEventListener("close", (event) => {
        if (event.code === 1008) {
          clearTimeout(timer)
          reject(new Error("closed unauthorized"))
        }
      })

      ws.addEventListener("unexpected-response", (_req, res) => {
        clearTimeout(timer)
        reject(new Error(`unexpected response ${res.statusCode}`))
      })
    })

    expect(opened).toBe(true)
  })

  test("missing first-message auth fails closed", async () => {
    const { app, config } = await bootTestApp({ wsAuthFrameTimeoutMs: 200 })
    const { wsUrl } = await getListeningHttpBase(app, config)

    expect(await waitForCloseCode(wsUrl)).toBe(1008)
  })
})
