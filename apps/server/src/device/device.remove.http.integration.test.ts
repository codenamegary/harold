import { afterEach, describe, expect, test } from "bun:test"
import { UnauthorizedProblemSchema, ForbiddenProblemSchema } from "contracts/http/error"
import { devicePath } from "contracts/http/device"
import { CreateSessionResponseSchema } from "contracts/http/session"
import { sessionEventsPath } from "contracts/http/session.stream"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { openSseStream } from "test-support/session-stream"
import { bootTestApp, seedTestDevice } from "../test-support/test.harness"
import { enableAgent } from "../test-support/test.app"
import { Config } from "../config/config"
import { clearDevicePresence } from "./device.presence"

const authHeaders = (credential: string) => ({
  authorization: `Bearer ${credential}`,
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

const createSession = async (credential: string, httpBase: string, cwd: string) => {
  const response = await fetch(`${httpBase}/v1/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(credential),
    },
    body: JSON.stringify({ agentId: "cursor", cwd }),
  })
  expect(response.status).toBe(201)
  return CreateSessionResponseSchema.parse(await response.json())
}

describe("device remove", () => {
  test("DELETE removes the device, ends the event stream, and blocks the credential", async () => {
    const { app, config, database } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "remove-1",
        sessionLoadSessionId: "remove-1",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const { httpBase } = await getListeningBase(app, config)
    const credential = app.deviceCredential.credential
    const deviceId = app.deviceCredential.deviceId
    const created = await createSession(credential, httpBase, "/tmp/remove-project")

    const deviceStream = await openSseStream({
      url: `${httpBase}${sessionEventsPath(created.sessionId, { agentId: "cursor" })}`,
      credential,
    })

    const endPromise = deviceStream.waitForEnd()

    const removeResponse = await fetch(`${httpBase}${devicePath(deviceId)}`, {
      method: "DELETE",
      headers: authHeaders(credential),
    })
    expect(removeResponse.status).toBe(204)
    expect(await removeResponse.text()).toBe("")

    await endPromise

    const httpDenied = await fetch(`${httpBase}/v1/workspaces`, {
      headers: authHeaders(credential),
    })
    expect(httpDenied.status).toBe(401)

    const reopenResponse = await fetch(
      `${httpBase}${sessionEventsPath(created.sessionId, { agentId: "cursor" })}`,
      {
        headers: authHeaders(credential),
      },
    )
    expect(reopenResponse.status).toBe(401)
    UnauthorizedProblemSchema.parse(await reopenResponse.json())

    const pairingReference = database.sqlite
      .query<{ count: number }, [string]>(
        "SELECT COUNT(*) AS count FROM pairing_codes WHERE device_id = ?",
      )
      .get(deviceId)
    expect(pairingReference?.count).toBe(0)
  })

  test("a device cannot remove another device", async () => {
    const { app, config, database } = await bootTestApp({ whichFn })
    const { httpBase } = await getListeningBase(app, config)
    const second = seedTestDevice(database)

    const response = await fetch(`${httpBase}${devicePath(app.deviceCredential.deviceId)}`, {
      method: "DELETE",
      headers: authHeaders(second.credential),
    })
    expect(response.status).toBe(403)
    expect(response.headers.get("content-type")).toContain("application/problem+json")
    ForbiddenProblemSchema.parse(await response.json())

    // The target device is untouched and its credential keeps working.
    const stillAuthorized = await fetch(`${httpBase}/v1/workspaces`, {
      headers: authHeaders(app.deviceCredential.credential),
    })
    expect(stillAuthorized.status).toBe(200)
  })

  test("a device removes itself", async () => {
    const { app, config, database } = await bootTestApp({ whichFn })
    const { httpBase } = await getListeningBase(app, config)
    const second = seedTestDevice(database)

    const response = await fetch(`${httpBase}${devicePath(second.deviceId)}`, {
      method: "DELETE",
      headers: authHeaders(second.credential),
    })
    expect(response.status).toBe(204)
  })

  test("self-removal invalidates the credential, so a repeat DELETE is unauthorized", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)
    const credential = app.deviceCredential.credential
    const deviceId = app.deviceCredential.deviceId

    const first = await fetch(`${httpBase}${devicePath(deviceId)}`, {
      method: "DELETE",
      headers: authHeaders(credential),
    })
    expect(first.status).toBe(204)

    const second = await fetch(`${httpBase}${devicePath(deviceId)}`, {
      method: "DELETE",
      headers: authHeaders(credential),
    })
    expect(second.status).toBe(401)
    UnauthorizedProblemSchema.parse(await second.json())
  })

  test("unknown deviceId is forbidden for a paired device", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningBase(app, config)

    const response = await fetch(`${httpBase}${devicePath("device_01J0000000000000000000000")}`, {
      method: "DELETE",
      headers: authHeaders(app.deviceCredential.credential),
    })
    expect(response.status).toBe(403)
    expect(response.headers.get("content-type")).toContain("application/problem+json")
    ForbiddenProblemSchema.parse(await response.json())
  })
})
