import { afterEach, describe, expect, test } from "bun:test"
import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"
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
    wsUrl: `ws://${config.host}:${address.port}/v1/events`,
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

const openHostStream = (wsUrl: string): Promise<{
  ws: WebSocket
  events: Event[]
  waitForType: (type: Event["type"], timeoutMs?: number) => Promise<Event>
}> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(`${wsUrl}?cursor=0`)
    const events: Event[] = []
    const waiters: Array<{
      type: Event["type"]
      resolve: (event: Event) => void
      reject: (error: Error) => void
      timer: ReturnType<typeof setTimeout>
    }> = []

    const notify = (event: Event) => {
      events.push(event)
      const matched = waiters.filter((waiter) => waiter.type === event.type)
      for (const waiter of matched) {
        clearTimeout(waiter.timer)
        const index = waiters.indexOf(waiter)
        if (index >= 0) {
          waiters.splice(index, 1)
        }
        waiter.resolve(event)
      }
    }

    const timer = setTimeout(() => {
      ws.close()
      reject(new Error("timeout opening host stream"))
    }, 2_000)

    ws.addEventListener("open", () => {
      clearTimeout(timer)
      resolve({
        ws,
        events,
        waitForType: (type, timeoutMs = 2_000) =>
          new Promise((waitResolve, waitReject) => {
            const existing = events.find((event) => event.type === type)
            if (existing !== undefined) {
              waitResolve(existing)
              return
            }

            const waiterTimer = setTimeout(() => {
              waitReject(new Error(`timeout waiting for ${type}`))
            }, timeoutMs)
            waiters.push({
              type,
              resolve: waitResolve,
              reject: waitReject,
              timer: waiterTimer,
            })
          }),
      })
    })

    ws.addEventListener("message", (message) => {
      const frame = EventFrameSchema.parse(JSON.parse(String(message.data)))
      for (const event of frame) {
        notify(event)
      }
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

  test("claim emits device.paired on journal and stream", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config, database } = await createTestApp(resources, dataDir)
    const { httpBase, wsUrl } = await getListeningBase(app, config)
    const host = await openHostStream(wsUrl)

    const paired = await pairDevice(httpBase, { name: "Watch", platform: "wearos" })
    const pairedEvent = await host.waitForType("device.paired")
    expect(pairedEvent.type).toBe("device.paired")
    if (pairedEvent.type !== "device.paired") {
      throw new Error("expected device.paired")
    }
    expect(pairedEvent.payload.deviceId).toBe(paired.device.id)
    expect(pairedEvent.payload.name).toBe("Watch")
    expect(pairedEvent.payload.platform).toBe("wearos")

    const journal = createEventJournalRepository(database)
    const records = journal.readAfter({ cursor: 0n, limit: 1_000 })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      throw new Error("journal read failed")
    }
    expect(records.value.some((record) => record.kind === "device.paired")).toBe(true)

    await closeSocket(host.ws)
  })

  test("list state follows real WS presence and emits connect/disconnect", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const { httpBase, wsUrl } = await getListeningBase(app, config)
    const host = await openHostStream(wsUrl)
    const paired = await pairDevice(httpBase)

    const beforeConnect = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(beforeConnect.items[0]?.state).toBe("offline")

    const deviceWs = await openDeviceStream(wsUrl, paired.credential)
    const connected = await host.waitForType("device.connected")
    expect(connected.type).toBe("device.connected")
    if (connected.type !== "device.connected") {
      throw new Error("expected device.connected")
    }
    expect(connected.payload.deviceId).toBe(paired.device.id)

    const online = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(online.items[0]?.state).toBe("online")

    const onlineFilter = DeviceCollectionSchema.parse(
      await (
        await fetch(`${httpBase}${DEVICES_PATH}?state=online`)
      ).json(),
    )
    expect(onlineFilter.items).toHaveLength(1)

    await closeSocket(deviceWs)
    const disconnected = await host.waitForType("device.disconnected")
    expect(disconnected.type).toBe("device.disconnected")
    if (disconnected.type !== "device.disconnected") {
      throw new Error("expected device.disconnected")
    }
    expect(disconnected.payload.deviceId).toBe(paired.device.id)

    const offline = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(offline.items[0]?.state).toBe("offline")

    await closeSocket(host.ws)
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

    await closeSocket(host.ws)
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
