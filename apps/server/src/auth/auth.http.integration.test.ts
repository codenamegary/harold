import { afterEach, describe, expect, test } from "bun:test"
import { UnauthorizedProblemSchema } from "contracts/http/error"
import {
  ClaimPairingCodeResponseSchema,
  CreatePairingCodeResponseSchema,
  PAIRING_CODES_PATH,
  claimPairingCodePath,
} from "contracts/http/pairing-code"
import { eq } from "drizzle-orm"
import { WebSocket } from "ws"
import {
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
} from "../test-support/create-test-app"
import { devices } from "../persistence/schema/devices"
import { AgentDatabase } from "../persistence/database"
import { Config } from "../config/config"
import { hashDeviceCredential } from "../device/hash.device.credential"
import { BEARER_CHALLENGE } from "./problems"

const resources = createTestAppResources()

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

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
    wsUrl: `ws://${config.host}:${address.port}/v1/events`,
  }
}

const pairDevice = async (httpBase: string) => {
  const createResponse = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  })
  expect(createResponse.status).toBe(201)
  const created = CreatePairingCodeResponseSchema.parse(await createResponse.json())

  const claimResponse = await fetch(
    `${httpBase}${claimPairingCodePath(created.code)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Auth test device" }),
    },
  )
  expect(claimResponse.status).toBe(201)
  return ClaimPairingCodeResponseSchema.parse(await claimResponse.json())
}

const seedActiveDevice = (database: AgentDatabase, credential: string) => {
  const pairedAt = "2026-08-02T12:00:00.000Z"
  database.db
    .insert(devices)
    .values({
      id: "device_auth_seed",
      name: "Seeded device",
      platform: "test",
      credentialHash: hashDeviceCredential(credential),
      pairedAt,
      lastSeenAt: pairedAt,
      revokedAt: null,
    })
    .run()
}

const websocketUpgradeHeaders = {
  connection: "upgrade",
  upgrade: "websocket",
  "sec-websocket-version": "13",
  "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
}

describe("device auth HTTP", () => {
  test("host loopback without Bearer can create pairing codes and list workspaces", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningHttpBase(app, config)

    const createResponse = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(createResponse.status).toBe(201)

    const workspaces = await fetch(`${httpBase}/v1/workspaces`)
    expect(workspaces.status).toBe(200)
  })

  test("valid device Bearer unlocks operator HTTP", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningHttpBase(app, config)
    const paired = await pairDevice(httpBase)

    const response = await fetch(`${httpBase}/v1/workspaces`, {
      headers: { authorization: `Bearer ${paired.credential}` },
    })
    expect(response.status).toBe(200)
  })

  test("bad Bearer on loopback returns 401 with Bearer challenge", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningHttpBase(app, config)

    const response = await fetch(`${httpBase}/v1/workspaces`, {
      headers: { authorization: "Bearer not-a-real-credential" },
    })

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe(BEARER_CHALLENGE)
    expect(response.headers.get("content-type")).toContain("application/problem+json")
    const problem = UnauthorizedProblemSchema.parse(await response.json())
    expect(problem.status).toBe(401)
  })

  test("revoked device credential returns 401", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config, database } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningHttpBase(app, config)
    const paired = await pairDevice(httpBase)

    database.db
      .update(devices)
      .set({ revokedAt: "2026-08-02T12:00:00.000Z" })
      .where(eq(devices.id, paired.device.id))
      .run()

    const response = await fetch(`${httpBase}/v1/workspaces`, {
      headers: { authorization: `Bearer ${paired.credential}` },
    })

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe(BEARER_CHALLENGE)
  })

  test("pairing claim stays open without operator auth", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningHttpBase(app, config)

    const createResponse = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const created = CreatePairingCodeResponseSchema.parse(await createResponse.json())

    const claimResponse = await fetch(
      `${httpBase}${claimPairingCodePath(created.code)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    )
    expect(claimResponse.status).toBe(201)
  })

  test("status stays open without Bearer", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningHttpBase(app, config)

    const response = await fetch(`${httpBase}/v1/status`)
    expect(response.status).toBe(200)
  })

  test("non-loopback without Bearer is rejected on protected routes", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir, {
      isLoopbackRequest: () => false,
    })
    const { httpBase } = await getListeningHttpBase(app, config)

    const workspaces = await fetch(`${httpBase}/v1/workspaces`)
    expect(workspaces.status).toBe(401)
    expect(workspaces.headers.get("www-authenticate")).toBe(BEARER_CHALLENGE)

    const sessions = await fetch(`${httpBase}/v1/sessions`)
    expect(sessions.status).toBe(401)

    const agents = await fetch(`${httpBase}/v1/settings/agents`)
    expect(agents.status).toBe(401)

    const pairingCreate = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(pairingCreate.status).toBe(401)
  })
})

describe("trusted proxy host principal", () => {
  const patchTrustedProxies = async (httpBase: string, trustedProxies: string[]) => {
    const response = await fetch(`${httpBase}/v1/settings/runtime`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trustedProxies }),
    })
    expect(response.status).toBe(200)
  }

  test("direct loopback without forwarded headers stays host", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningHttpBase(app, config)
    await patchTrustedProxies(httpBase, ["127.0.0.1"])

    const response = await fetch(`${httpBase}/v1/workspaces`)
    expect(response.status).toBe(200)
  })

  test("trusted loopback peer with forwarded headers is not host", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningHttpBase(app, config)
    await patchTrustedProxies(httpBase, ["127.0.0.1"])

    const response = await fetch(`${httpBase}/v1/workspaces`, {
      headers: {
        "x-forwarded-for": "203.0.113.5",
      },
    })

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe(BEARER_CHALLENGE)
  })

  test("spoofed forwarded headers from untrusted loopback stay host", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningHttpBase(app, config)

    const response = await fetch(`${httpBase}/v1/workspaces`, {
      headers: {
        "x-forwarded-for": "203.0.113.5",
      },
    })

    expect(response.status).toBe(200)
  })

  test("hot-reloads trusted proxies after PATCH", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningHttpBase(app, config)

    const beforePatch = await fetch(`${httpBase}/v1/workspaces`, {
      headers: {
        "x-forwarded-for": "203.0.113.5",
      },
    })
    expect(beforePatch.status).toBe(200)

    await patchTrustedProxies(httpBase, ["127.0.0.1"])

    const afterPatch = await fetch(`${httpBase}/v1/workspaces`, {
      headers: {
        "x-forwarded-for": "203.0.113.5",
      },
    })
    expect(afterPatch.status).toBe(401)
  })

  test("allowlist miss ignores forwarded headers on loopback", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningHttpBase(app, config)
    await patchTrustedProxies(httpBase, ["10.0.0.0/8"])

    const response = await fetch(`${httpBase}/v1/workspaces`, {
      headers: {
        "x-forwarded-for": "203.0.113.5",
      },
    })

    expect(response.status).toBe(200)
  })
})

describe("device auth WebSocket", () => {
  test("loopback without Bearer connects as host", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { wsUrl } = await getListeningHttpBase(app, config)

    const opened = await new Promise<boolean>((resolve, reject) => {
      const ws = new WebSocket(wsUrl)
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

    expect(opened).toBe(true)
  })

  test("Upgrade Authorization Bearer unlocks event stream", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase, wsUrl } = await getListeningHttpBase(app, config)
    const paired = await pairDevice(httpBase)

    const opened = await new Promise<boolean>((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: { authorization: `Bearer ${paired.credential}` },
      })
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

    expect(opened).toBe(true)
  })

  test("bad Upgrade Bearer rejects with 401 challenge", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningHttpBase(app, config)

    const response = await fetch(`${httpBase}/v1/events`, {
      headers: {
        ...websocketUpgradeHeaders,
        authorization: "Bearer bad-credential",
      },
    })

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe(BEARER_CHALLENGE)
    UnauthorizedProblemSchema.parse(await response.json())
  })

  test("first-message auth frame unlocks non-loopback stream", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config, database } = await createTestApp(resources, dataDir, {
      isLoopbackRequest: () => false,
      wsAuthFrameTimeoutMs: 2_000,
    })
    const { wsUrl } = await getListeningHttpBase(app, config)
    const credential = "devcred_first_message_auth"
    seedActiveDevice(database, credential)

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

  test("missing first-message auth on non-loopback fails closed", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir, {
      isLoopbackRequest: () => false,
      wsAuthFrameTimeoutMs: 200,
    })
    const { wsUrl } = await getListeningHttpBase(app, config)

    const closeCode = await new Promise<number>((resolve, reject) => {
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

    expect(closeCode).toBe(1008)
  })
})
