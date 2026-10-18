import { describe, expect, test } from "bun:test"
import { UnauthorizedProblemSchema } from "contracts/http/error"
import {
  ClaimPairingCodeResponseSchema,
  CreatePairingCodeResponseSchema,
  PAIRING_CODES_PATH,
  claimPairingCodePath,
} from "contracts/http/pairing-code"
import { eq } from "drizzle-orm"
import { bootTestApp, seedTestDevice } from "../test-support/test.harness"
import { devices } from "../persistence/schema/devices"
import { Config } from "../config/config"
import { BEARER_CHALLENGE } from "./problems"

const getListeningHttpBase = async (
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

const authHeaders = (credential: string) => ({ authorization: `Bearer ${credential}` })

const createPairingCode = async (httpBase: string, credential: string) => {
  const createResponse = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders(credential) },
    body: JSON.stringify({}),
  })
  expect(createResponse.status).toBe(201)
  return CreatePairingCodeResponseSchema.parse(await createResponse.json())
}

const expectUnauthorized = async (response: Response) => {
  expect(response.status).toBe(401)
  expect(response.headers.get("www-authenticate")).toBe(BEARER_CHALLENGE)
  expect(response.headers.get("content-type")).toContain("application/problem+json")
  const problem = UnauthorizedProblemSchema.parse(await response.json())
  expect(problem.status).toBe(401)
}

describe("device-only HTTP edge", () => {
  test("unauthenticated request on loopback is rejected on protected routes", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningHttpBase(app, config)

    await expectUnauthorized(await fetch(`${httpBase}/v1/workspaces`))
    await expectUnauthorized(await fetch(`${httpBase}/v1/sessions`))
    await expectUnauthorized(await fetch(`${httpBase}/v1/settings/agents`))
    await expectUnauthorized(
      await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    )
  })

  test("valid device Bearer unlocks user HTTP", async () => {
    const { app, config, database } = await bootTestApp()
    const { httpBase } = await getListeningHttpBase(app, config)
    const { credential } = seedTestDevice(database)

    const response = await fetch(`${httpBase}/v1/workspaces`, { headers: authHeaders(credential) })
    expect(response.status).toBe(200)
  })

  test("bad Bearer returns 401 with Bearer challenge", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningHttpBase(app, config)

    const response = await fetch(`${httpBase}/v1/workspaces`, {
      headers: { authorization: "Bearer not-a-real-credential" },
    })

    await expectUnauthorized(response)
  })

  test("revoked device credential returns 401", async () => {
    const { app, config, database } = await bootTestApp()
    const { httpBase } = await getListeningHttpBase(app, config)
    const { deviceId, credential } = seedTestDevice(database)

    database.db
      .update(devices)
      .set({ revokedAt: "2026-08-02T12:00:00.000Z" })
      .where(eq(devices.id, deviceId))
      .run()

    const response = await fetch(`${httpBase}/v1/workspaces`, { headers: authHeaders(credential) })

    expect(response.status).toBe(401)
    expect(response.headers.get("www-authenticate")).toBe(BEARER_CHALLENGE)
  })

  test("status stays open without Bearer", async () => {
    const { app, config } = await bootTestApp()
    const { httpBase } = await getListeningHttpBase(app, config)

    const response = await fetch(`${httpBase}/v1/status`)
    expect(response.status).toBe(200)
  })

  test("pairing claim stays open without Bearer", async () => {
    const { app, config, database } = await bootTestApp()
    const { httpBase } = await getListeningHttpBase(app, config)
    const { credential } = seedTestDevice(database)
    const created = await createPairingCode(httpBase, credential)

    const claimResponse = await fetch(`${httpBase}${claimPairingCodePath(created.code)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Claimed without credential" }),
    })
    expect(claimResponse.status).toBe(201)
    ClaimPairingCodeResponseSchema.parse(await claimResponse.json())
  })
})
