import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import {
  ClaimPairingCodeResponseSchema,
  PairingCodeValueSchema,
  claimPairingCodePath,
} from "contracts/http/pairing-code"
import { NotFoundProblemSchema, ConflictProblemSchema } from "contracts/http/error"
import { makeCreatePairingCode } from "core/device/create.pairing.code.usecase"
import { bootTestApp } from "../test-support/test.harness"
import { devices } from "../persistence/schema/devices"
import { pairingCodes } from "../persistence/schema/pairing-codes"
import { Config } from "../config/config"
import { makeInsertPairingCode } from "./device.sqlite.adapters"

const LAN_ENDPOINT = "http://192.168.1.20:3847"

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

// Creating pairing codes is a host operation against the same database the
// daemon serves. The network surface only exposes the claim (#458).
const seedPairingCode = (
  database: Parameters<typeof makeInsertPairingCode>[0]["database"],
  endpoint = LAN_ENDPOINT,
) => makeCreatePairingCode({ insertPairingCode: makeInsertPairingCode(database) })(endpoint)

describe("pairing HTTP integration", () => {
  test("creating codes is a host operation: POST /v1/pairing-codes is not registered", async () => {
    const { app, config } = await bootTestApp()
    const httpBase = await getListeningHttpBase(app, config)

    const createResponse = await fetch(`${httpBase}/v1/pairing-codes`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({}),
    })

    expect(createResponse.status).toBe(404)
  })

  test("claim once, second claim fails", async () => {
    const { app, config, database } = await bootTestApp()
    const httpBase = await getListeningHttpBase(app, config)
    const created = await seedPairingCode(database)

    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(created.value.id).toMatch(/^pair_/)
    expect(PairingCodeValueSchema.parse(created.value.code)).toBe(created.value.code)
    expect(created.value.state).toBe("active")
    expect(created.value.endpoint).toBe(LAN_ENDPOINT)
    const ttlMs = Date.parse(created.value.expiresAt) - Date.parse(created.value.createdAt)
    expect(ttlMs).toBe(10 * 60 * 1000)

    const claimResponse = await fetch(
      `${httpBase}${claimPairingCodePath(created.value.code.toLowerCase())}`,
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
    expect(claimed.device.state).toBe("offline")
    expect(claimed.credential).toMatch(/^devcred_/)
    expect(claimed.credential.includes(created.value.code)).toBe(false)

    const pairingRow = database.db
      .select()
      .from(pairingCodes)
      .where(eq(pairingCodes.id, created.value.id))
      .get()
    expect(pairingRow?.codeHash.startsWith("$argon2id$")).toBe(true)
    expect(pairingRow?.codeHash.includes(created.value.code)).toBe(false)
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

    const secondClaim = await fetch(`${httpBase}${claimPairingCodePath(created.value.code)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Other" }),
    })

    expect(secondClaim.status).toBe(409)
    expect(secondClaim.headers.get("content-type")).toContain("application/problem+json")
    const problem = ConflictProblemSchema.parse(await secondClaim.json())
    expect(problem.title).toBe("Pairing code already claimed")
  })

  test("expired pairing codes cannot be claimed", async () => {
    const { app, config, database } = await bootTestApp()
    const httpBase = await getListeningHttpBase(app, config)
    const created = await seedPairingCode(database)

    if (!created.ok) throw new Error("expected seeded pairing code")

    database.db
      .update(pairingCodes)
      .set({ expiresAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(pairingCodes.id, created.value.id))
      .run()

    const claimResponse = await fetch(`${httpBase}${claimPairingCodePath(created.value.code)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })

    expect(claimResponse.status).toBe(409)
    expect(claimResponse.headers.get("content-type")).toContain("application/problem+json")
    const problem = ConflictProblemSchema.parse(await claimResponse.json())
    expect(problem.title).toBe("Pairing code expired")
  })

  test("unknown pairing code returns not found", async () => {
    const { app, config } = await bootTestApp()
    const httpBase = await getListeningHttpBase(app, config)

    const claimResponse = await fetch(`${httpBase}${claimPairingCodePath("AAA-AAA")}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    })

    expect(claimResponse.status).toBe(404)
    expect(claimResponse.headers.get("content-type")).toContain("application/problem+json")
    NotFoundProblemSchema.parse(await claimResponse.json())
  })

  test("claim accepts display name", async () => {
    const { app, config, database } = await bootTestApp()
    const httpBase = await getListeningHttpBase(app, config)
    const created = await seedPairingCode(database)

    if (!created.ok) throw new Error("expected seeded pairing code")

    const claimResponse = await fetch(`${httpBase}${claimPairingCodePath(created.value.code)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Pixel 8", platform: "android" }),
    })

    expect(claimResponse.status).toBe(201)
    const claimed = ClaimPairingCodeResponseSchema.parse(await claimResponse.json())
    expect(claimed.device.name).toBe("Pixel 8")
    expect(claimed.device.platform).toBe("android")
  })
})
