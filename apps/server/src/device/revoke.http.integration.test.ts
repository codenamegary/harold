import { afterEach, describe, expect, test } from "bun:test"
import { EventFrameSchema } from "contracts/events/stream"
import { Event } from "contracts/events/event"
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
import { eventDataText } from "../test/event.data.text"
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
      const frame = EventFrameSchema.parse(JSON.parse(eventDataText(message.data)))
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

const closeSocket = (ws: WebSocket): Promise<void> =>
  new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve()
      return
    }
    ws.addEventListener("close", () => resolve())
    ws.close()
  })

describe("device revoke", () => {
  test("DELETE revokes device, closes WS, blocks credential, emits device.revoked", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config, database } = await createTestApp(resources, dataDir)
    const { httpBase, wsUrl } = await getListeningBase(app, config)
    const host = await openHostStream(wsUrl)
    const paired = await pairDevice(httpBase, { name: "To revoke", platform: "android" })

    const deviceWs = await openDeviceStream(wsUrl, paired.credential)
    await host.waitForType("device.connected")

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

    const revokedEvent = await host.waitForType("device.revoked")
    expect(revokedEvent.type).toBe("device.revoked")
    if (revokedEvent.type !== "device.revoked") {
      throw new Error("expected device.revoked")
    }
    expect(revokedEvent.payload.deviceId).toBe(paired.device.id)

    const disconnected = await host.waitForType("device.disconnected")
    expect(disconnected.type).toBe("device.disconnected")
    if (disconnected.type !== "device.disconnected") {
      throw new Error("expected device.disconnected")
    }
    expect(disconnected.payload.deviceId).toBe(paired.device.id)

    const httpDenied = await fetch(`${httpBase}/v1/workspaces`, {
      headers: { authorization: `Bearer ${paired.credential}` },
    })
    expect(httpDenied.status).toBe(401)
    UnauthorizedProblemSchema.parse(await httpDenied.json())

    const reopenResponse = await fetch(`${httpBase}/v1/events`, {
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

    const journal = createEventJournalRepository(database)
    const records = journal.readAfter({ cursor: 0n, limit: 1_000 })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      throw new Error("journal read failed")
    }
    const revokedKinds = records.value.filter((record) => record.kind === "device.revoked")
    expect(revokedKinds).toHaveLength(1)

    await closeSocket(host.ws)
  })

  test("idempotent second DELETE returns 204 without re-emitting device.revoked", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config, database } = await createTestApp(resources, dataDir)
    const { httpBase, wsUrl } = await getListeningBase(app, config)
    const host = await openHostStream(wsUrl)
    const paired = await pairDevice(httpBase)

    const first = await fetch(`${httpBase}${devicePath(paired.device.id)}`, {
      method: "DELETE",
    })
    expect(first.status).toBe(204)
    await host.waitForType("device.revoked")

    const journal = createEventJournalRepository(database)
    const beforeSecond = journal.readAfter({ cursor: 0n, limit: 1_000 })
    expect(beforeSecond.ok).toBe(true)
    if (!beforeSecond.ok) {
      throw new Error("journal read failed")
    }
    const revokedBefore = beforeSecond.value.filter(
      (record) => record.kind === "device.revoked",
    ).length

    const second = await fetch(`${httpBase}${devicePath(paired.device.id)}`, {
      method: "DELETE",
    })
    expect(second.status).toBe(204)

    await new Promise((resolve) => setTimeout(resolve, 100))

    const afterSecond = journal.readAfter({ cursor: 0n, limit: 1_000 })
    expect(afterSecond.ok).toBe(true)
    if (!afterSecond.ok) {
      throw new Error("journal read failed")
    }
    const revokedAfter = afterSecond.value.filter(
      (record) => record.kind === "device.revoked",
    ).length
    expect(revokedAfter).toBe(revokedBefore)

    await closeSocket(host.ws)
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

  test("hardDelete removes device from list and emits device.revoked", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config, database } = await createTestApp(resources, dataDir)
    const { httpBase, wsUrl } = await getListeningBase(app, config)
    const host = await openHostStream(wsUrl)
    const paired = await pairDevice(httpBase, { name: "Hard delete me", platform: "ios" })

    const response = await fetch(
      `${httpBase}${deleteDevicePath(paired.device.id, { hardDelete: true })}`,
      { method: "DELETE" },
    )
    expect(response.status).toBe(204)

    const revokedEvent = await host.waitForType("device.revoked")
    expect(revokedEvent.type).toBe("device.revoked")
    if (revokedEvent.type !== "device.revoked") {
      throw new Error("expected device.revoked")
    }
    expect(revokedEvent.payload.deviceId).toBe(paired.device.id)

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(listed.items).toHaveLength(0)

    const journal = createEventJournalRepository(database)
    const records = journal.readAfter({ cursor: 0n, limit: 1_000 })
    expect(records.ok).toBe(true)
    if (!records.ok) {
      throw new Error("journal read failed")
    }
    expect(records.value.filter((record) => record.kind === "device.revoked")).toHaveLength(1)

    await closeSocket(host.ws)
  })

  test("hardDelete of already-revoked device removes row without second device.revoked", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config, database } = await createTestApp(resources, dataDir)
    const { httpBase, wsUrl } = await getListeningBase(app, config)
    const host = await openHostStream(wsUrl)
    const paired = await pairDevice(httpBase)

    const soft = await fetch(`${httpBase}${devicePath(paired.device.id)}`, {
      method: "DELETE",
    })
    expect(soft.status).toBe(204)
    await host.waitForType("device.revoked")

    const afterSoft = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(afterSoft.items).toHaveLength(1)
    expect(afterSoft.items[0]?.state).toBe("revoked")

    const journal = createEventJournalRepository(database)
    const beforeHard = journal.readAfter({ cursor: 0n, limit: 1_000 })
    expect(beforeHard.ok).toBe(true)
    if (!beforeHard.ok) {
      throw new Error("journal read failed")
    }
    const revokedBefore = beforeHard.value.filter(
      (record) => record.kind === "device.revoked",
    ).length

    const hard = await fetch(
      `${httpBase}${deleteDevicePath(paired.device.id, { hardDelete: true })}`,
      { method: "DELETE" },
    )
    expect(hard.status).toBe(204)

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(listed.items).toHaveLength(0)

    const afterHard = journal.readAfter({ cursor: 0n, limit: 1_000 })
    expect(afterHard.ok).toBe(true)
    if (!afterHard.ok) {
      throw new Error("journal read failed")
    }
    const revokedAfter = afterHard.value.filter(
      (record) => record.kind === "device.revoked",
    ).length
    expect(revokedAfter).toBe(revokedBefore)

    await closeSocket(host.ws)
  })
})
