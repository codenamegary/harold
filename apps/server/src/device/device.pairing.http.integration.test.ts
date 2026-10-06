import { describe, expect, test } from "bun:test"
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
import { bootTestApp } from "../test-support/test.harness"
import { devices } from "../persistence/schema/devices"
import { pairingCodes } from "../persistence/schema/pairing-codes"
import { Config } from "../config/config"

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
  test("create, claim once, second claim fails", async () => {
    const { app, config, database } = await bootTestApp()
    const httpBase = await getListeningHttpBase(app, config)

    const createResponse = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({}),
    })

    expect(createResponse.status).toBe(201)
    expect(createResponse.headers.get("authorization")).toBeNull()

    const created = CreatePairingCodeResponseSchema.parse(await createResponse.json())
    expect(created.id).toMatch(/^pair_/)
    expect(PairingCodeValueSchema.parse(created.code)).toBe(created.code)
    expect(created.state).toBe("active")
    expect(created.endpoint).toBe(`http://${config.host}:${config.port}`)
    const ttlMs = Date.parse(created.expiresAt) - Date.parse(created.createdAt)
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
    expect(claimed.device.state).toBe("offline")
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

    const secondClaim = await fetch(`${httpBase}${claimPairingCodePath(created.code)}`, {
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

    const createResponse = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({}),
    })
    const created = CreatePairingCodeResponseSchema.parse(await createResponse.json())

    database.db
      .update(pairingCodes)
      .set({ expiresAt: "2020-01-01T00:00:00.000Z" })
      .where(eq(pairingCodes.id, created.id))
      .run()

    const claimResponse = await fetch(`${httpBase}${claimPairingCodePath(created.code)}`, {
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

  test("create pairing code uses advertised URL when set", async () => {
    const { app, config } = await bootTestApp()
    const httpBase = await getListeningHttpBase(app, config)

    const patchResponse = await fetch(`${httpBase}/v1/settings/runtime`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({ advertisedUrl: "https://agents.example.com" }),
    })
    expect(patchResponse.status).toBe(200)

    const createResponse = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({}),
    })

    expect(createResponse.status).toBe(201)
    const created = CreatePairingCodeResponseSchema.parse(await createResponse.json())
    expect(created.endpoint).toBe("https://agents.example.com")
  })

  test("claim accepts display name", async () => {
    const { app, config } = await bootTestApp()
    const httpBase = await getListeningHttpBase(app, config)

    const createResponse = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({}),
    })
    const created = CreatePairingCodeResponseSchema.parse(await createResponse.json())

    const claimResponse = await fetch(`${httpBase}${claimPairingCodePath(created.code)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Pixel 8", platform: "android" }),
    })

    expect(claimResponse.status).toBe(201)
    const claimed = ClaimPairingCodeResponseSchema.parse(await claimResponse.json())
    expect(claimed.device.name).toBe("Pixel 8")
    expect(claimed.device.platform).toBe("android")
  })

  test("pairing endpoint uses advertised URL when set, otherwise loopback", async () => {
    const { app, config } = await bootTestApp()
    const httpBase = await getListeningHttpBase(app, config)

    const loopbackCreate = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({}),
    })
    const loopbackPairing = CreatePairingCodeResponseSchema.parse(await loopbackCreate.json())
    expect(loopbackPairing.endpoint).toBe(`http://${config.host}:${config.port}`)

    const patchResponse = await fetch(`${httpBase}/v1/settings/runtime`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({ advertisedUrl: "https://agents.example.com" }),
    })
    expect(patchResponse.status).toBe(200)

    const advertisedCreate = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({}),
    })
    const advertisedPairing = CreatePairingCodeResponseSchema.parse(await advertisedCreate.json())
    expect(advertisedPairing.endpoint).toBe("https://agents.example.com")

    const clearResponse = await fetch(`${httpBase}/v1/settings/runtime`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({ advertisedUrl: null }),
    })
    expect(clearResponse.status).toBe(200)

    const clearedCreate = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({}),
    })
    const clearedPairing = CreatePairingCodeResponseSchema.parse(await clearedCreate.json())
    expect(clearedPairing.endpoint).toBe(`http://${config.host}:${config.port}`)
  })

  test("local pairing after clearing stale advertised URL uses loopback endpoint", async () => {
    const { app, config } = await bootTestApp()
    const httpBase = await getListeningHttpBase(app, config)

    const setAdvertisedResponse = await fetch(`${httpBase}/v1/settings/runtime`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({ advertisedUrl: "https://agents.example.com" }),
    })
    expect(setAdvertisedResponse.status).toBe(200)

    const staleCreate = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({}),
    })
    const stalePairing = CreatePairingCodeResponseSchema.parse(await staleCreate.json())
    expect(stalePairing.endpoint).toBe("https://agents.example.com")

    const clearResponse = await fetch(`${httpBase}/v1/settings/runtime`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({ advertisedUrl: null }),
    })
    expect(clearResponse.status).toBe(200)

    const localCreate = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({}),
    })
    const localPairing = CreatePairingCodeResponseSchema.parse(await localCreate.json())
    expect(localPairing.endpoint).toBe(`http://${config.host}:${config.port}`)
  })

  test("loopback pairing keeps advertised URL when requested", async () => {
    const { app, config } = await bootTestApp()
    const httpBase = await getListeningHttpBase(app, config)

    const setAdvertisedResponse = await fetch(`${httpBase}/v1/settings/runtime`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({ advertisedUrl: "https://agents.example.com" }),
    })
    expect(setAdvertisedResponse.status).toBe(200)

    const loopbackCreate = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({ endpoint: "loopback" }),
    })
    const loopbackPairing = CreatePairingCodeResponseSchema.parse(await loopbackCreate.json())
    expect(loopbackPairing.endpoint).toBe(`http://${config.host}:${config.port}`)

    const settingsResponse = await fetch(`${httpBase}/v1/settings/runtime`, {
      headers: { authorization: `Bearer ${app.deviceCredential.credential}` },
    })
    const settingsBody = (await settingsResponse.json()) as {
      settings: { advertisedUrl: string | null }
    }
    expect(settingsBody.settings.advertisedUrl).toBe("https://agents.example.com")
  })

  test("disabled advertised URL uses loopback until re-enabled", async () => {
    const { app, config } = await bootTestApp()
    const httpBase = await getListeningHttpBase(app, config)

    const setAdvertisedResponse = await fetch(`${httpBase}/v1/settings/runtime`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({ advertisedUrl: "https://agents.example.com" }),
    })
    expect(setAdvertisedResponse.status).toBe(200)

    const disableResponse = await fetch(`${httpBase}/v1/settings/runtime`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({ advertisedUrlEnabled: false }),
    })
    expect(disableResponse.status).toBe(200)

    const disabledCreate = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({}),
    })
    const disabledPairing = CreatePairingCodeResponseSchema.parse(await disabledCreate.json())
    expect(disabledPairing.endpoint).toBe(`http://${config.host}:${config.port}`)

    const advertisedCreate = await fetch(`${httpBase}${PAIRING_CODES_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${app.deviceCredential.credential}`,
      },
      body: JSON.stringify({ endpoint: "advertised" }),
    })
    expect(advertisedCreate.status).toBe(400)
  })
})
