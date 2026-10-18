import { afterEach, describe, expect, test } from "bun:test"
import { UnauthorizedProblemSchema, NotFoundProblemSchema } from "contracts/http/error"
import {
  ClaimPairingCodeResponseSchema,
  CreatePairingCodeResponseSchema,
  PAIRING_CODES_PATH,
  claimPairingCodePath,
} from "contracts/http/pairing-code"
import {
  DeviceCollectionSchema,
  DEVICES_PATH,
  deleteDevicePath,
  devicePath,
} from "contracts/http/device"
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

describe("device revoke", () => {
  test("DELETE revokes device, ends the event stream, blocks credential", async () => {
    const { app, config } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "revoke-1",
        sessionLoadSessionId: "revoke-1",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const { httpBase } = await getListeningBase(app, config)
    const paired = await pairDevice(
      httpBase,
      { name: "To revoke", platform: "android" },
      app.deviceCredential.credential,
    )
    const created = await createSession(app, httpBase, "/tmp/revoke-project")

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

    const endPromise = deviceStream.waitForEnd()

    const revokeResponse = await fetch(`${httpBase}${devicePath(paired.device.id)}`, {
      method: "DELETE",
      headers: authHeaders(app),
    })
    expect(revokeResponse.status).toBe(204)
    expect(await revokeResponse.text()).toBe("")

    await endPromise

    const httpDenied = await fetch(`${httpBase}/v1/workspaces`, {
      headers: { authorization: `Bearer ${paired.credential}` },
    })
    expect(httpDenied.status).toBe(401)
    UnauthorizedProblemSchema.parse(await httpDenied.json())

    const reopenResponse = await fetch(
      `${httpBase}${sessionEventsPath(created.sessionId, { agentId: "cursor" })}`,
      {
        headers: { authorization: `Bearer ${paired.credential}` },
      },
    )
    expect(reopenResponse.status).toBe(401)
    UnauthorizedProblemSchema.parse(await reopenResponse.json())

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })).json(),
    )
    const revoked = listed.items.find((item) => item.id === paired.device.id)
    expect(revoked?.state).toBe("revoked")
  })

  test("idempotent second DELETE returns 204", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)
    const paired = await pairDevice(httpBase, {}, app.deviceCredential.credential)

    const first = await fetch(`${httpBase}${devicePath(paired.device.id)}`, {
      method: "DELETE",
      headers: authHeaders(app),
    })
    expect(first.status).toBe(204)

    const second = await fetch(`${httpBase}${devicePath(paired.device.id)}`, {
      method: "DELETE",
      headers: authHeaders(app),
    })
    expect(second.status).toBe(204)

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })).json(),
    )
    expect(listed.items[0]?.state).toBe("revoked")
  })

  test("unknown deviceId returns 404 Problem+JSON", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)

    const response = await fetch(`${httpBase}${devicePath("device_01J0000000000000000000000")}`, {
      method: "DELETE",
      headers: authHeaders(app),
    })
    expect(response.status).toBe(404)
    expect(response.headers.get("content-type")).toContain("application/problem+json")
    NotFoundProblemSchema.parse(await response.json())
  })

  test("hardDelete removes device from list", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)
    const paired = await pairDevice(
      httpBase,
      { name: "Hard delete me", platform: "ios" },
      app.deviceCredential.credential,
    )

    const response = await fetch(
      `${httpBase}${deleteDevicePath(paired.device.id, { hardDelete: true })}`,
      { method: "DELETE", headers: authHeaders(app) },
    )
    expect(response.status).toBe(204)

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })).json(),
    )
    expect(listed.items.map((item) => item.id)).toEqual([app.deviceCredential.deviceId])
  })

  test("hardDelete of already-revoked device removes row", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)
    const paired = await pairDevice(httpBase, {}, app.deviceCredential.credential)

    const soft = await fetch(`${httpBase}${devicePath(paired.device.id)}`, {
      method: "DELETE",
      headers: authHeaders(app),
    })
    expect(soft.status).toBe(204)

    const afterSoft = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })).json(),
    )
    const afterSoftRevoked = afterSoft.items.find((item) => item.id === paired.device.id)
    expect(afterSoftRevoked?.state).toBe("revoked")

    const hard = await fetch(
      `${httpBase}${deleteDevicePath(paired.device.id, { hardDelete: true })}`,
      { method: "DELETE", headers: authHeaders(app) },
    )
    expect(hard.status).toBe(204)

    const listed = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`, { headers: authHeaders(app) })).json(),
    )
    expect(listed.items.map((item) => item.id)).toEqual([app.deviceCredential.deviceId])
  })
})
