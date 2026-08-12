import { afterEach, describe, expect, test } from "bun:test"
import {
  ClaimPairingCodeResponseSchema,
  CreatePairingCodeResponseSchema,
  PAIRING_CODES_PATH,
  claimPairingCodePath,
} from "contracts/http/pairing-code"
import { DeviceCollectionSchema, DEVICES_PATH } from "contracts/http/device"
import { WebSocket } from "ws"
import {
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
} from "../test-support/create-test-app"
import { Config } from "../config/config"
import { createEventJournalRepository } from "../event/journal.repository"
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

const openHostStream = (wsUrl: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout opening host stream"))
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

const closeSocket = (ws: WebSocket): Promise<void> =>
  new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve()
      return
    }
    ws.addEventListener("close", () => resolve())
    ws.close()
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

describe("device registry and presence", () => {
  test("GET /v1/devices lists empty and paired devices with offline state", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningBase(app, config)

    const emptyResponse = await fetch(`${httpBase}${DEVICES_PATH}`)
    expect(emptyResponse.status).toBe(200)
    const empty = DeviceCollectionSchema.parse(await emptyResponse.json())
    expect(empty.items).toEqual([])
    expect(empty.page.count).toBe(0)

    const paired = await pairDevice(httpBase, { name: "Pixel", platform: "android" })
    expect(paired.device.state).toBe("offline")

    const listResponse = await fetch(`${httpBase}${DEVICES_PATH}`)
    expect(listResponse.status).toBe(200)
    const listed = DeviceCollectionSchema.parse(await listResponse.json())
    expect(listed.items).toHaveLength(1)
    expect(listed.items[0]?.id).toBe(paired.device.id)
    expect(listed.items[0]?.name).toBe("Pixel")
    expect(listed.items[0]?.state).toBe("offline")
    expect(listed.page.count).toBe(1)
  })

  test("claim emits device.paired on journal", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config, database } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningBase(app, config)

    const paired = await pairDevice(httpBase, { name: "Watch", platform: "wearos" })

    const journal = createEventJournalRepository(database)
    const records = journal.readAfter({ cursor: 0n, limit: 1_000 })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      throw new Error("journal read failed")
    }
    expect(records.value.some((record) => record.kind === "device.paired")).toBe(true)
    const pairedRecord = records.value.find((record) => record.kind === "device.paired")
    expect(pairedRecord).toMatchObject({
      kind: "device.paired",
      payload: {
        deviceId: paired.device.id,
        name: "Watch",
        platform: "wearos",
      },
    })
  })

  test("list state follows real WS presence and emits connect/disconnect journal rows", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config, database } = await createTestApp(resources, dataDir)
    const { httpBase, wsUrl } = await getListeningBase(app, config)
    const paired = await pairDevice(httpBase)
    const journal = createEventJournalRepository(database)

    const beforeConnect = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(beforeConnect.items[0]?.state).toBe("offline")

    const deviceWs = await openDeviceStream(wsUrl, paired.credential)
    await waitFor(async () => {
      const online = DeviceCollectionSchema.parse(
        await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
      )
      return online.items[0]?.state === "online"
    })

    const onlineFilter = DeviceCollectionSchema.parse(
      await (
        await fetch(`${httpBase}${DEVICES_PATH}?state=online`)
      ).json(),
    )
    expect(onlineFilter.items).toHaveLength(1)

    const afterConnect = journal.readAfter({ cursor: 0n, limit: 1_000 })
    expect(afterConnect.ok).toBe(true)
    if (!afterConnect.ok) {
      throw new Error("journal read failed")
    }
    expect(afterConnect.value.some((record) => record.kind === "device.connected")).toBe(true)

    await closeSocket(deviceWs)
    await waitFor(async () => {
      const offline = DeviceCollectionSchema.parse(
        await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
      )
      return offline.items[0]?.state === "offline"
    })

    const afterDisconnect = journal.readAfter({ cursor: 0n, limit: 1_000 })
    expect(afterDisconnect.ok).toBe(true)
    if (!afterDisconnect.ok) {
      throw new Error("journal read failed")
    }
    expect(afterDisconnect.value.some((record) => record.kind === "device.disconnected")).toBe(
      true,
    )
  })

  test("host streams do not mark devices online", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase, wsUrl } = await getListeningBase(app, config)
    const paired = await pairDevice(httpBase)
    const host = await openHostStream(wsUrl)

    await new Promise((resolve) => setTimeout(resolve, 100))

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(listed.items[0]?.id).toBe(paired.device.id)
    expect(listed.items[0]?.state).toBe("offline")

    await closeSocket(host)
  })

  test("authenticated device HTTP updates lastSeenAt without flipping online", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningBase(app, config)
    const paired = await pairDevice(httpBase)
    const initialLastSeen = paired.device.lastSeenAt
    expect(initialLastSeen).not.toBeNull()

    await new Promise((resolve) => setTimeout(resolve, 20))

    const workspaces = await fetch(`${httpBase}/v1/workspaces`, {
      headers: { authorization: `Bearer ${paired.credential}` },
    })
    expect(workspaces.status).toBe(200)

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(listed.items[0]?.state).toBe("offline")
    expect(listed.items[0]?.lastSeenAt).not.toBeNull()
    expect(Date.parse(listed.items[0]?.lastSeenAt ?? "")).toBeGreaterThan(
      Date.parse(initialLastSeen ?? ""),
    )
  })
})
