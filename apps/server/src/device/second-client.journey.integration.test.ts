import { afterEach, describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { UnauthorizedProblemSchema, ConflictProblemSchema } from "contracts/http/error"
import { DeviceCollectionSchema, DEVICES_PATH, devicePath } from "contracts/http/device"
import { WorkspaceSchema } from "contracts/http/workspace"
import { createLogCapture, assertSecretFreeLogs } from "test-support/second-client/log-capture"
import { getListeningEndpoints } from "test-support/second-client/endpoint"
import {
  claimPairingCode,
  createPairingCode,
  pairDevice,
} from "test-support/second-client/pairing"
import { createSecondClient } from "test-support/second-client"
import {
  closeWebSocket,
  waitForSocketClose,
} from "test-support/second-client/streams"
import {
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  createWorkspaceDir,
} from "../test-support/create-test-app"
import { createEventJournalRepository } from "../event/journal.repository"
import { clearDevicePresence } from "./presence"
import { pairingCodes } from "../persistence/schema/pairing-codes"

const resources = createTestAppResources()

afterEach(async () => {
  clearDevicePresence()
  await cleanupTestAppResources(resources)
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

describe("second-client journey", () => {
  test("full MS2 lifecycle: pair, reconnect, operate, presence, revoke, access loss", async () => {
    const logCapture = createLogCapture()
    const dataDir = await createTempDataDir(resources)
    const { app, config, database } = await createTestApp(resources, dataDir, {
      logStream: logCapture.stream,
    })
    const { httpBase, wsUrl } = await getListeningEndpoints({
      app,
      host: config.host,
    })

    const paired = await pairDevice({
      httpBase,
      body: { name: "Journey client", platform: "test-second-client" },
    })

    const journal = createEventJournalRepository(database)
    await waitFor(() => {
      const records = journal.readAfter({ cursor: 0n, limit: 1_000 })
      return (
        records.ok &&
        records.value.some(
          (record) =>
            record.kind === "device.paired" &&
            record.payload.deviceId === paired.deviceId,
        )
      )
    })

    const firstClient = createSecondClient({
      httpBase,
      wsUrl,
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

    const deviceWs = await reconnected.openEventStream()
    await waitFor(async () => {
      const online = DeviceCollectionSchema.parse(
        await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
      )
      return online.items[0]?.state === "online"
    })
    await waitFor(() => {
      const records = journal.readAfter({ cursor: 0n, limit: 1_000 })
      return (
        records.ok &&
        records.value.some(
          (record) =>
            record.kind === "device.connected" &&
            record.payload.deviceId === paired.deviceId,
        )
      )
    })

    const online = DeviceCollectionSchema.parse(
      await (await fetch(`${httpBase}${DEVICES_PATH}`)).json(),
    )
    expect(online.items).toHaveLength(1)
    expect(online.items[0]?.id).toBe(paired.deviceId)
    expect(online.items[0]?.state).toBe("online")

    const closePromise = waitForSocketClose(deviceWs)
    const revokeResponse = await fetch(`${httpBase}${devicePath(paired.deviceId)}`, {
      method: "DELETE",
    })
    expect(revokeResponse.status).toBe(204)

    const closed = await closePromise
    expect(closed.code).toBe(1008)
    expect(closed.reason).toBe("unauthorized")

    await waitFor(() => {
      const records = journal.readAfter({ cursor: 0n, limit: 1_000 })
      return (
        records.ok &&
        records.value.some(
          (record) =>
            record.kind === "device.revoked" &&
            record.payload.deviceId === paired.deviceId,
        ) &&
        records.value.some(
          (record) =>
            record.kind === "device.disconnected" &&
            record.payload.deviceId === paired.deviceId,
        )
      )
    })

    const httpDenied = await reconnected.fetch("/v1/workspaces")
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

    assertSecretFreeLogs({
      logOutput: logCapture.getOutput(),
      credential: paired.credential,
      pairingCode: paired.pairingCode,
    })

    await closeWebSocket(deviceWs)
  })

  test("recovery: claimed and expired codes return structured errors, regenerate succeeds", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config, database } = await createTestApp(resources, dataDir)
    const { httpBase } = await getListeningEndpoints({
      app,
      host: config.host,
    })

    const created = await createPairingCode(httpBase)
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
    expect(secondClaim.response.headers.get("content-type")).toContain(
      "application/problem+json",
    )
    const claimedProblem = ConflictProblemSchema.parse(await secondClaim.response.json())
    expect(claimedProblem.title).toBe("Pairing code already claimed")

    const expiredCandidate = await createPairingCode(httpBase)
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

    const regenerated = await createPairingCode(httpBase)
    const recovered = await claimPairingCode({
      httpBase,
      code: regenerated.code,
      body: { name: "Recovered client" },
    })
    expect(recovered.response.status).toBe(201)
    expect(recovered.claim?.device.name).toBe("Recovered client")
  })
})
