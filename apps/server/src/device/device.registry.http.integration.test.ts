import { afterEach, describe, expect, test } from "bun:test"
import {
  ClaimPairingCodeResponseSchema,
  CreatePairingCodeResponseSchema,
  PAIRING_CODES_PATH,
  claimPairingCodePath,
} from "contracts/http/pairing-code"
import { DeviceCollectionSchema, DEVICES_PATH } from "contracts/http/device"
import { UnauthorizedProblemSchema } from "contracts/http/error"
import { CreateSessionResponseSchema } from "contracts/http/session"
import { sessionEventsPath } from "contracts/http/session.stream"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { openSseStream } from "test-support/session-stream"
import { bootTestApp } from "../test-support/test.harness"
import { enableAgent } from "../test-support/test.app"
import { Config } from "../config/config"
import { clearDevicePresence } from "./device.presence"

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

afterEach(async () => {
  clearDevicePresence()
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
  }
}

const pairDevice = async (
  httpBase: string,
  body: Record<string, unknown> = {},
  userCredential?: string,
) => {
  const createResponse = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(userCredential === undefined ? {} : { authorization: `Bearer ${userCredential}` }),
    },
    body: JSON.stringify({}),
  })
  expect(createResponse.status).toBe(201)
  const created = CreatePairingCodeResponseSchema.parse(await createResponse.json())

  const claimResponse = await fetch(`${httpBase}${claimPairingCodePath(created.code)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  expect(claimResponse.status).toBe(201)
  return ClaimPairingCodeResponseSchema.parse(await claimResponse.json())
}

const createSession = async (
  app: { deviceCredential: { credential: string } },
  httpBase: string,
  cwd: string,
) => {
  const response = await fetch(`${httpBase}/v1/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(app),
    },
    body: JSON.stringify({ agentId: "cursor", cwd }),
  })
  expect(response.status).toBe(201)
  return CreateSessionResponseSchema.parse(await response.json())
}

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
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)

    const emptyResponse = await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })
    expect(emptyResponse.status).toBe(200)
    const empty = DeviceCollectionSchema.parse(await emptyResponse.json())
    expect(empty.items.map((item) => item.id)).toEqual([app.deviceCredential.deviceId])
    expect(empty.page.count).toBe(1)

    const paired = await pairDevice(
      httpBase,
      { name: "Pixel", platform: "android" },
      app.deviceCredential.credential,
    )
    expect(paired.device.state).toBe("offline")

    const listResponse = await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })
    expect(listResponse.status).toBe(200)
    const listed = DeviceCollectionSchema.parse(await listResponse.json())
    const pixel = listed.items.find((item) => item.id === paired.device.id)
    expect(pixel?.name).toBe("Pixel")
    expect(pixel?.state).toBe("offline")
    expect(listed.page.count).toBe(2)
  })

  test("claim persists paired device in registry", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)

    const paired = await pairDevice(
      httpBase,
      { name: "Watch", platform: "wearos" },
      app.deviceCredential.credential,
    )

    const listResponse = await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })
    expect(listResponse.status).toBe(200)
    const listed = DeviceCollectionSchema.parse(await listResponse.json())
    expect(listed.items.find((item) => item.id === paired.device.id)).toEqual(
      expect.objectContaining({
        id: paired.device.id,
        name: "Watch",
        platform: "wearos",
        state: "offline",
      }),
    )
  })

  test("list state follows SSE stream presence for connect/disconnect", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "registry-presence-1",
        sessionLoadSessionId: "registry-presence-1",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const { httpBase } = await getListeningBase(app, config)
    const paired = await pairDevice(httpBase, {}, app.deviceCredential.credential)
    const created = await createSession(app, httpBase, "/tmp/registry-presence")

    const beforeConnect = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })).json(),
    )
    expect(beforeConnect.items[0]?.state).toBe("offline")

    const deviceStream = await openSseStream({
      url: `${httpBase}${sessionEventsPath(created.sessionId, { agentId: "cursor" })}`,
      credential: paired.credential,
    })
    await waitFor(async () => {
      const online = DeviceCollectionSchema.parse(
        await (await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })).json(),
      )
      return online.items[0]?.state === "online"
    })

    const onlineFilter = DeviceCollectionSchema.parse(
      await (
        await fetch(`${httpBase}${DEVICES_PATH}?state=online`, { headers: authHeaders(app) })
      ).json(),
    )
    expect(onlineFilter.items).toHaveLength(1)

    await deviceStream.close()
    await waitFor(async () => {
      const offline = DeviceCollectionSchema.parse(
        await (await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })).json(),
      )
      return offline.items[0]?.state === "offline"
    })
  })

  test("unauthenticated stream requests are rejected and do not mark devices online", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)
    const paired = await pairDevice(httpBase, {}, app.deviceCredential.credential)

    const response = await fetch(`${httpBase}/v1/sessions/s1/events?agentId=cursor`)
    expect(response.status).toBe(401)
    UnauthorizedProblemSchema.parse(await response.json())

    await new Promise((resolve) => setTimeout(resolve, 100))

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })).json(),
    )
    expect(listed.items[0]?.id).toBe(paired.device.id)
    expect(listed.items[0]?.state).toBe("offline")
  })

  test("authenticated device HTTP updates lastSeenAt without flipping online", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)
    const paired = await pairDevice(httpBase, {}, app.deviceCredential.credential)
    const initialLastSeen = paired.device.lastSeenAt
    expect(initialLastSeen).not.toBeNull()

    await new Promise((resolve) => setTimeout(resolve, 20))

    const workspaces = await fetch(`${httpBase}/v1/workspaces`, {
      headers: { authorization: `Bearer ${paired.credential}` },
    })
    expect(workspaces.status).toBe(200)

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })).json(),
    )
    expect(listed.items[0]?.state).toBe("offline")
    expect(listed.items[0]?.lastSeenAt).not.toBeNull()
    expect(Date.parse(listed.items[0]?.lastSeenAt ?? "")).toBeGreaterThan(
      Date.parse(initialLastSeen ?? ""),
    )
  })
})
