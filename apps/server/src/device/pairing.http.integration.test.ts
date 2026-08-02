import { afterEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import {
  ClaimPairingCodeResponseSchema,
  CreatePairingCodeResponseSchema,
  PAIRING_CODES_PATH,
  PairingCodeValueSchema,
  claimPairingCodePath,
} from "contracts/http/pairing-code"
import { NotFoundProblemSchema, ConflictProblemSchema } from "contracts/http/error"
import {
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
} from "../test-support/create-test-app"
import { devices } from "../persistence/schema/devices"
import { pairingCodes } from "../persistence/schema/pairing-codes"
import { Config } from "../config/config"

const resources = createTestAppResources()

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

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

  return `http://${config.host}:${address.port}`
}

describe("pairing HTTP integration", () => {
  test("create without credential, claim once, second claim fails", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config, database } = await createTestApp(resources, dataDir)
    const httpBase = await getListeningHttpBase(app, config)

    const createResponse = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })

    expect(createResponse.status).toBe(201)
    expect(createResponse.headers.get("authorization")).toBeNull()

    const created = CreatePairingCodeResponseSchema.parse(await createResponse.json())
    expect(created.id).toMatch(/^pair_/)
    expect(PairingCodeValueSchema.parse(created.code)).toBe(created.code)
    expect(created.state).toBe("active")
    expect(created.endpoint).toBe(`http://${config.host}:${config.port}`)
    const ttlMs =
      Date.parse(created.expiresAt) - Date.parse(created.createdAt)
    expect(ttlMs).toBe(10 * 60 * 1000)

    const claimResponse = await fetch(
      `${httpBase}${claimPairingCodePath(created.code.toLowerCase())}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ platform: "test-client" }),
      },
    )

    expect(claimResponse.status).toBe(201)
    const claimed = ClaimPairingCodeResponseSchema.parse(await claimResponse.json())
    expect(claimed.device.id).toMatch(/^device_/)
    expect(claimed.device.name).toBe("Paired device")
    expect(claimed.device.platform).toBe("test-client")
    expect(claimed.device.state).toBe("online")
    expect(claimed.credential).toMatch(/^devcred_/)
    expect(claimed.credential.includes(created.code)).toBe(false)

    const pairingRow = database.db
      .select()
      .from(pairingCodes)
      .where(eq(pairingCodes.id, created.id))
      .get()
    expect(pairingRow?.codeHash.startsWith("$argon2id$")).toBe(true)
    expect(pairingRow?.codeHash.includes(created.code)).toBe(false)
    expect(pairingRow?.state).toBe("claimed")

    const deviceRow = database.db
      .select()
      .from(devices)
      .where(eq(devices.id, claimed.device.id))
      .get()
    expect(deviceRow?.credentialHash).toBe(
      createHash("sha256").update(claimed.credential).digest("hex"),
    )
    expect(deviceRow?.credentialHash.includes(claimed.credential)).toBe(false)

    const secondClaim = await fetch(
      `${httpBase}${claimPairingCodePath(created.code)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Other" }),
      },
    )

    expect(secondClaim.status).toBe(409)
    expect(secondClaim.headers.get("content-type")).toContain(
      "application/problem+json",
    )
    const problem = ConflictProblemSchema.parse(await secondClaim.json())
    expect(problem.title).toBe("Pairing code already claimed")
  })

  test("expired pairing codes cannot be claimed", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config, database } = await createTestApp(resources, dataDir)
    const httpBase = await getListeningHttpBase(app, config)

    const createResponse = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const created = CreatePairingCodeResponseSchema.parse(await createResponse.json())

    database.db
      .update(pairingCodes)
      .set({ expiresAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(pairingCodes.id, created.id))
      .run()

    const claimResponse = await fetch(
      `${httpBase}${claimPairingCodePath(created.code)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    )

    expect(claimResponse.status).toBe(409)
    expect(claimResponse.headers.get("content-type")).toContain(
      "application/problem+json",
    )
    const problem = ConflictProblemSchema.parse(await claimResponse.json())
    expect(problem.title).toBe("Pairing code expired")
  })

  test("unknown pairing code returns not found", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const httpBase = await getListeningHttpBase(app, config)

    const claimResponse = await fetch(
      `${httpBase}${claimPairingCodePath("AAA-AAA")}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
    )

    expect(claimResponse.status).toBe(404)
    expect(claimResponse.headers.get("content-type")).toContain(
      "application/problem+json",
    )
    NotFoundProblemSchema.parse(await claimResponse.json())
  })

  test("claim accepts display name", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app, config } = await createTestApp(resources, dataDir)
    const httpBase = await getListeningHttpBase(app, config)

    const createResponse = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })
    const created = CreatePairingCodeResponseSchema.parse(await createResponse.json())

    const claimResponse = await fetch(
      `${httpBase}${claimPairingCodePath(created.code)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Pixel 8", platform: "android" }),
      },
    )

    expect(claimResponse.status).toBe(201)
    const claimed = ClaimPairingCodeResponseSchema.parse(await claimResponse.json())
    expect(claimed.device.name).toBe("Pixel 8")
    expect(claimed.device.platform).toBe("android")
  })
})
