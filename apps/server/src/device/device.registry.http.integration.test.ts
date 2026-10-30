import { afterEach, describe, expect, test } from "bun:test"
import { ClaimPairingCodeResponseSchema, claimPairingCodePath } from "contracts/http/pairing-code"
import { UnauthorizedProblemSchema } from "contracts/http/error"
import { makeCreatePairingCode } from "core/device/create.pairing.code.usecase"
import { CreateSessionResponseSchema } from "contracts/http/session"
import { sessionEventsPath } from "contracts/http/session.stream"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { openSseStream } from "test-support/session-stream"
import { bootTestApp } from "../test-support/test.harness"
import { enableAgent } from "../test-support/test.app"
import { Config } from "../config/config"
import { assembleDeviceSlice } from "./device.assembly"
import { makeInsertPairingCode } from "./device.sqlite.adapters"
import { clearDevicePresence } from "./device.presence"

const LAN_ENDPOINT = "http://192.168.1.20:3847"

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

// Codes are minted in process (host operation); the claim stays on the wire.
const seedPairingCode = async (
  database: Parameters<typeof makeInsertPairingCode>[0]["database"],
) => {
  const result = await makeCreatePairingCode({
    insertPairingCode: makeInsertPairingCode(database),
  })(LAN_ENDPOINT)
  if (!result.ok) throw new Error("failed to seed pairing code")
  return result.value
}

const claimOverHttp = async (
  httpBase: string,
  code: string,
  body: Record<string, unknown> = {},
) => {
  const claimResponse = await fetch(`${httpBase}${claimPairingCodePath(code)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  expect(claimResponse.status).toBe(201)
  return ClaimPairingCodeResponseSchema.parse(await claimResponse.json())
}

const pairDevice = async (
  database: Parameters<typeof makeInsertPairingCode>[0]["database"],
  httpBase: string,
  body: Record<string, unknown> = {},
) => {
  const created = await seedPairingCode(database)
  return claimOverHttp(httpBase, created.code, body)
}

const createSession = async (credential: string, httpBase: string, cwd: string) => {
  const response = await fetch(`${httpBase}/v1/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${credential}`,
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
  test("listing devices is a host operation: GET /v1/devices is not registered", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)

    const response = await fetch(`${httpBase}/v1/devices`, {
      headers: { authorization: `Bearer ${app.deviceCredential.credential}` },
    })
    expect(response.status).toBe(404)
  })

  test("claim persists paired device in the host-visible registry", async () => {
    const { app, config, database } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)
    const slice = assembleDeviceSlice({ database })

    const paired = await pairDevice(database, httpBase, { name: "Watch", platform: "wearos" })

    const listed = slice.listDevices({ limit: 10 })
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    expect(listed.value.items.find((item) => item.id === paired.device.id)).toEqual(
      expect.objectContaining({
        id: paired.device.id,
        name: "Watch",
        platform: "wearos",
        state: "offline",
      }),
    )
    expect(listed.value.items.map((item) => item.id)).toContain(app.deviceCredential.deviceId)
  })

  test("list state follows SSE stream presence for connect/disconnect", async () => {
    const { app, config, database } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "registry-presence-1",
        sessionLoadSessionId: "registry-presence-1",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const { httpBase } = await getListeningBase(app, config)
    const slice = assembleDeviceSlice({ database })
    const paired = await pairDevice(database, httpBase)
    const created = await createSession(
      app.deviceCredential.credential,
      httpBase,
      "/tmp/registry-presence",
    )

    const offlineNow = () => {
      const listed = slice.listDevices({ limit: 10 })
      if (!listed.ok) throw new Error("list failed")
      return listed.value.items.find((item) => item.id === paired.device.id)?.state
    }
    expect(offlineNow()).toBe("offline")

    const deviceStream = await openSseStream({
      url: `${httpBase}${sessionEventsPath(created.sessionId, { agentId: "cursor" })}`,
      credential: paired.credential,
    })
    await waitFor(() => offlineNow() === "online")

    await deviceStream.close()
    await waitFor(() => offlineNow() === "offline")
  })

  test("unauthenticated stream requests are rejected and do not mark devices online", async () => {
    const { app, config, database } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)
    const slice = assembleDeviceSlice({ database })
    const paired = await pairDevice(database, httpBase)

    const response = await fetch(`${httpBase}/v1/sessions/s1/events?agentId=cursor`)
    expect(response.status).toBe(401)
    UnauthorizedProblemSchema.parse(await response.json())

    await new Promise((resolve) => setTimeout(resolve, 100))

    const listed = slice.listDevices({ limit: 10 })
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    const device = listed.value.items.find((item) => item.id === paired.device.id)
    expect(device?.state).toBe("offline")
  })

  test("authenticated device HTTP updates lastSeenAt without flipping online", async () => {
    const { app, config, database } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)
    const slice = assembleDeviceSlice({ database })
    const paired = await pairDevice(database, httpBase)
    const initialLastSeen = paired.device.lastSeenAt
    expect(initialLastSeen).not.toBeNull()

    await new Promise((resolve) => setTimeout(resolve, 20))

    const workspaces = await fetch(`${httpBase}/v1/workspaces`, {
      headers: { authorization: `Bearer ${paired.credential}` },
    })
    expect(workspaces.status).toBe(200)

    const listed = slice.listDevices({ limit: 10 })
    expect(listed.ok).toBe(true)
    if (!listed.ok) return
    const device = listed.value.items.find((item) => item.id === paired.device.id)
    expect(device?.state).toBe("offline")
    expect(device?.lastSeenAt).not.toBeNull()
    expect(Date.parse(device?.lastSeenAt ?? "")).toBeGreaterThan(Date.parse(initialLastSeen ?? ""))
  })
})
