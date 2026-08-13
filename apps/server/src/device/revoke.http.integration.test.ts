import { afterEach, describe, expect, test } from "bun:test"
import { UnauthorizedProblemSchema, NotFoundProblemSchema } from "contracts/http/error"
import {
  ClaimPairingCodeResponseSchema,
  CreatePairingCodeResponseSchema,
  PAIRING_CODES_PATH,
  claimPairingCodePath,
} from "contracts/http/pairing-code"
import { DeviceCollectionSchema, DEVICES_PATH, deleteDevicePath, devicePath } from "contracts/http/device"
import { WebSocket } from "ws"
import {
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
} from "../test-support/create-test-app"
import { Config } from "../config/config"
import { clearDevicePresence } from "./presence"

const resources = createTestAppResources()

afterEach(async () => {
  clearDevicePresence()
  await cleanupTestAppResources(resources)
})

const getListeningBase = async (
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

const pairDevice = async (httpBase: string, body: Record<string, unknown> = {}) => {
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
      body: JSON.stringify(body),
    },
  )
  expect(claimResponse.status).toBe(201)
  return ClaimPairingCodeResponseSchema.parse(await claimResponse.json())
}

const openDeviceStream = (wsUrl: string, credential: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, {
      headers: { authorization: `Bearer ${credential}` },
    })
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout opening device stream"))
    }, 2_000)

    ws.addEventListener("open", () => {
      clearTimeout(timer)
      resolve(ws)
    })

    ws.addEventListener("unexpected-response", (_req, res) => {
      clearTimeout(timer)
      reject(new Error(`unexpected response ${res.statusCode}`))
    })
  })

const waitForClose = (ws: WebSocket): Promise<{ code: number; reason: string }> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("timeout waiting for socket close"))
    }, 2_000)

    ws.addEventListener("close", (event) => {
      clearTimeout(timer)
      resolve({ code: event.code, reason: String(event.reason) })
    })

    if (ws.readyState === WebSocket.CLOSED) {
      clearTimeout(timer)
      reject(new Error("socket already closed before waitForClose"))
    }
  })

const waitFor = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 5_000) => {
  const startedAt = Date.now()
  while (!(await predicate())) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe("device revoke", () => {
  test("DELETE revokes device, closes WS, blocks credential", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase, wsUrl } = await getListeningBase(app, config)
    const paired = await pairDevice(httpBase, { name: "To revoke", platform: "android" })

    const deviceWs = await openDeviceStream(wsUrl, paired.credential)
    await waitFor(async () => {
      const online = DeviceCollectionSchema.parse(
        await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
      )
      return online.items[0]?.state === "online"
    })

    const closePromise = waitForClose(deviceWs)

    const revokeResponse = await fetch(
      `${httpBase}${devicePath(paired.device.id)}`,
      { method: "DELETE" },
    )
    expect(revokeResponse.status).toBe(204)
    expect(await revokeResponse.text()).toBe("")

    const closed = await closePromise
    expect(closed.code).toBe(1008)
    expect(closed.reason).toBe("unauthorized")

    const httpDenied = await fetch(`${httpBase}/v1/workspaces`, {
      headers: { authorization: `Bearer ${paired.credential}` },
    })
    expect(httpDenied.status).toBe(401)
    UnauthorizedProblemSchema.parse(await httpDenied.json())

    const reopenResponse = await fetch(`${httpBase}/v1/sessions/stream`, {
      headers: {
        connection: "upgrade",
        upgrade: "websocket",
        "sec-websocket-version": "13",
        "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
        authorization: `Bearer ${paired.credential}`,
      },
    })
    expect(reopenResponse.status).toBe(401)
    UnauthorizedProblemSchema.parse(await reopenResponse.json())

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(listed.items).toHaveLength(1)
    expect(listed.items[0]?.id).toBe(paired.device.id)
    expect(listed.items[0]?.state).toBe("revoked")

  })

  test("idempotent second DELETE returns 204", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningBase(app, config)
    const paired = await pairDevice(httpBase)

    const first = await fetch(`${httpBase}${devicePath(paired.device.id)}`, {
      method: "DELETE",
    })
    expect(first.status).toBe(204)

    const second = await fetch(`${httpBase}${devicePath(paired.device.id)}`, {
      method: "DELETE",
    })
    expect(second.status).toBe(204)

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(listed.items[0]?.state).toBe("revoked")
  })

  test("unknown deviceId returns 404 Problem+JSON", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningBase(app, config)

    const response = await fetch(
      `${httpBase}${devicePath("device_01J0000000000000000000000")}`,
      { method: "DELETE" },
    )
    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toContain("application/problem+json")
    NotFoundProblemSchema.parse(await response.json())
  })

  test("hardDelete removes device from list", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningBase(app, config)
    const paired = await pairDevice(httpBase, { name: "Hard delete me", platform: "ios" })

    const response = await fetch(
      `${httpBase}${deleteDevicePath(paired.device.id, { hardDelete: true })}`,
      { method: "DELETE" },
    )
    expect(response.status).toBe(204)

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(listed.items).toHaveLength(0)
  })

  test("hardDelete of already-revoked device removes row", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningBase(app, config)
    const paired = await pairDevice(httpBase)

    const soft = await fetch(`${httpBase}${devicePath(paired.device.id)}`, {
      method: "DELETE",
    })
    expect(soft.status).toBe(204)

    const afterSoft = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(afterSoft.items).toHaveLength(1)
    expect(afterSoft.items[0]?.state).toBe("revoked")

    const hard = await fetch(
      `${httpBase}${deleteDevicePath(paired.device.id, { hardDelete: true })}`,
      { method: "DELETE" },
    )
    expect(hard.status).toBe(204)

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(listed.items).toHaveLength(0)
  })
})
