import { afterEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { UnauthorizedProblemSchema, ConflictProblemSchema } from "contracts/http/error"
import { DeviceCollectionSchema, DEVICES_PATH, devicePath } from "contracts/http/device"
import { CreateSessionResponseSchema } from "contracts/http/session"
import { sessionEventsPath } from "contracts/http/session.stream"
import { WorkspaceSchema } from "contracts/http/workspace"
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import { createLogCapture, assertSecretFreeLogs } from "test-support/second-client/log-capture"
import { getListeningEndpoints } from "test-support/second-client/endpoint"
import { claimPairingCode, createPairingCode, pairDevice } from "test-support/second-client/pairing"
import { createSecondClient } from "test-support/second-client"
import { bootTestApp } from "../test-support/test.harness"
import { createWorkspaceDir, enableAgent } from "../test-support/test.app"
import { clearDevicePresence } from "./device.presence"
import { pairingCodes } from "../persistence/schema/pairing-codes"

afterEach(async () => {
  clearDevicePresence()
})

const whichFn: WhichFn = (binaryName) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

const waitFor = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 5_000) => {
  const startedAt = Date.now()
  while (!(await predicate())) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

describe("second-client journey", () => {
  test("full MS2 lifecycle: pair, reconnect, operate, presence, remove, access loss", async () => {
    const logCapture = createLogCapture()
    const { app, config, dataDir } = await bootTestApp({
      logStream: logCapture.stream,
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "journey-1",
        sessionLoadSessionId: "journey-1",
      },
    })
    await enableAgent(app, "cursor", whichFn)
    const { httpBase } = await getListeningEndpoints({
      app,
      host: config.host,
    })

    const paired = await pairDevice({
      httpBase,
      body: { name: "Journey client", platform: "test-second-client" },
      credential: app.deviceCredential.credential,
    })

    const firstClient = createSecondClient({
      httpBase,
      deviceId: paired.deviceId,
      credential: paired.credential,
    })
    const firstProbe = await firstClient.fetch("/v1/workspaces")
    expect(firstProbe.status).toBe(200)

    const reconnected = firstClient.reconnect()
    expect(reconnected).not.toBe(firstClient)
    expect(reconnected.credential).toBe(paired.credential)
    expect(reconnected.deviceId).toBe(paired.deviceId)

    const reconnectProbe = await reconnected.fetch("/v1/workspaces")
    expect(reconnectProbe.status).toBe(200)

    const workspaceDir = await createWorkspaceDir(dataDir, "journey-workspace")
    const allowRootsResponse = await reconnected.fetch("/v1/settings/runtime", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allowedRoots: [dataDir] }),
    })
    expect(allowRootsResponse.status).toBe(200)

    const workspaceResponse = await reconnected.fetch("/v1/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Journey workspace", path: workspaceDir }),
    })
    expect(workspaceResponse.status).toBe(201)
    const workspace = WorkspaceSchema.parse(await workspaceResponse.json())
    expect(workspace.name).toBe("Journey workspace")

    const createSessionResponse = await reconnected.fetch("/v1/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "cursor", cwd: workspaceDir }),
    })
    expect(createSessionResponse.status).toBe(201)
    const created = CreateSessionResponseSchema.parse(await createSessionResponse.json())

    const deviceStream = await reconnected.openEventStream({
      agentId: "cursor",
      sessionId: created.sessionId,
    })
    await waitFor(async () => {
      const online = DeviceCollectionSchema.parse(
        await (
          await fetch(`${httpBase}${DEVICES_PATH}`, {
            headers: { authorization: `Bearer ${app.deviceCredential.credential}` },
          })
        ).json(),
      )
      return online.items.find((item) => item.id === paired.deviceId)?.state === "online"
    })
    const online = DeviceCollectionSchema.parse(
      await (
        await fetch(`${httpBase}${DEVICES_PATH}`, {
          headers: { authorization: `Bearer ${app.deviceCredential.credential}` },
        })
      ).json(),
    )
    const onlineEntry = online.items.find((item) => item.id === paired.deviceId)
    expect(onlineEntry?.state).toBe("online")

    const endPromise = deviceStream.waitForEnd()
    const removeResponse = await fetch(`${httpBase}${devicePath(paired.deviceId)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${app.deviceCredential.credential}` },
    })
    expect(removeResponse.status).toBe(204)

    await endPromise

    const listedAfterRemove = DeviceCollectionSchema.parse(
      await (
        await fetch(`${httpBase}${DEVICES_PATH}`, {
          headers: { authorization: `Bearer ${app.deviceCredential.credential}` },
        })
      ).json(),
    )
    expect(listedAfterRemove.items.find((item) => item.id === paired.deviceId)).toBeUndefined()

    const httpDenied = await reconnected.fetch("/v1/workspaces")
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

    assertSecretFreeLogs({
      logOutput: logCapture.getOutput(),
      credential: paired.credential,
      pairingCode: paired.pairingCode,
    })
  })

  test("recovery: claimed and expired codes return structured errors, regenerate succeeds", async () => {
    const { app, config, database } = await bootTestApp()
    const { httpBase } = await getListeningEndpoints({
      app,
      host: config.host,
    })

    const created = await createPairingCode({
      httpBase,
      credential: app.deviceCredential.credential,
    })
    const firstClaim = await claimPairingCode({
      httpBase,
      code: created.code,
      body: { name: "First claim" },
    })
    expect(firstClaim.response.status).toBe(201)
    expect(firstClaim.claim).not.toBeNull()

    const secondClaim = await claimPairingCode({
      httpBase,
      code: created.code,
      body: { name: "Second claim" },
    })
    expect(secondClaim.response.status).toBe(409)
    expect(secondClaim.response.headers.get("content-type")).toContain("application/problem+json")
    const claimedProblem = ConflictProblemSchema.parse(await secondClaim.response.json())
    expect(claimedProblem.title).toBe("Pairing code already claimed")

    const expiredCandidate = await createPairingCode({
      httpBase,
      credential: app.deviceCredential.credential,
    })
    database.db
      .update(pairingCodes)
      .set({ expiresAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(pairingCodes.id, expiredCandidate.id))
      .run()

    const expiredClaim = await claimPairingCode({
      httpBase,
      code: expiredCandidate.code,
      body: {},
    })
    expect(expiredClaim.response.status).toBe(409)
    const expiredProblem = ConflictProblemSchema.parse(await expiredClaim.response.json())
    expect(expiredProblem.title).toBe("Pairing code expired")

    const regenerated = await createPairingCode({
      httpBase,
      credential: app.deviceCredential.credential,
    })
    const recovered = await claimPairingCode({
      httpBase,
      code: regenerated.code,
      body: { name: "Recovered client" },
    })
    expect(recovered.response.status).toBe(201)
    expect(recovered.claim?.device.name).toBe("Recovered client")
  })
})
