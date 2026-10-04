import { describe, expect, test } from "bun:test"
import {
  CreatePairingCodeResponseSchema,
  PairingCodeValueSchema,
} from "contracts/http/pairing-code"
import { verifyPairingCode } from "./device.hash.pairing.code"
import { makeCreatePairingCode } from "./device.create.pairing.code.usecase"

const LOOPBACK_ENDPOINT = "http://127.0.0.1:4919"

const makeDeps = (overrides: Partial<Parameters<typeof makeCreatePairingCode>[0]> = {}) => ({
  loopbackEndpoint: LOOPBACK_ENDPOINT,
  getAdvertisedEndpointSettings: () => ({
    advertisedUrl: "https://tunnel.example.com" as string | null,
    advertisedUrlEnabled: true,
  }),
  insertPairingCode: () => {
    throw new Error("insertPairingCode should not be called")
  },
  ...overrides,
})

describe("create pairing code use case", () => {
  test("creates a code against the loopback endpoint when explicitly chosen", async () => {
    let insertedCodeHash = ""

    const createPairingCode = makeCreatePairingCode(
      makeDeps({
        insertPairingCode: (input) => {
          insertedCodeHash = input.codeHash
          return {
            ok: true,
            value: {
              id: "pair_1",
              createdAt: input.createdAt,
              expiresAt: input.expiresAt,
              state: "active",
            },
          }
        },
      }),
    )

    const result = await createPairingCode({ endpoint: "loopback" })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const response = CreatePairingCodeResponseSchema.parse(result.value)
    expect(response.endpoint).toBe(LOOPBACK_ENDPOINT)
    expect(response.state).toBe("active")
    expect(response.id).toMatch(/^pair_/)
    expect(PairingCodeValueSchema.safeParse(response.code).success).toBe(true)
    expect(await verifyPairingCode({ code: response.code, codeHash: insertedCodeHash })).toBe(true)
    expect(Date.parse(response.expiresAt) - Date.parse(response.createdAt)).toBe(10 * 60 * 1000)
  })

  test("uses the advertised endpoint by default when available", async () => {
    const createPairingCode = makeCreatePairingCode(
      makeDeps({
        insertPairingCode: (input) => ({
          ok: true,
          value: {
            id: "pair_2",
            createdAt: input.createdAt,
            expiresAt: input.expiresAt,
            state: "active",
          },
        }),
      }),
    )

    const result = await createPairingCode({})

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.endpoint).toBe("https://tunnel.example.com")
  })

  test("uses the advertised endpoint when explicitly chosen and available", async () => {
    const createPairingCode = makeCreatePairingCode(
      makeDeps({
        insertPairingCode: (input) => ({
          ok: true,
          value: {
            id: "pair_3",
            createdAt: input.createdAt,
            expiresAt: input.expiresAt,
            state: "active",
          },
        }),
      }),
    )

    const result = await createPairingCode({ endpoint: "advertised" })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.endpoint).toBe("https://tunnel.example.com")
  })

  test("falls back to loopback by default when the advertised url is null", async () => {
    const createPairingCode = makeCreatePairingCode(
      makeDeps({
        getAdvertisedEndpointSettings: () => ({
          advertisedUrl: null,
          advertisedUrlEnabled: true,
        }),
        insertPairingCode: (input) => ({
          ok: true,
          value: {
            id: "pair_4",
            createdAt: input.createdAt,
            expiresAt: input.expiresAt,
            state: "active",
          },
        }),
      }),
    )

    const result = await createPairingCode({})

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.endpoint).toBe(LOOPBACK_ENDPOINT)
  })

  test("falls back to loopback by default when advertising is disabled", async () => {
    const createPairingCode = makeCreatePairingCode(
      makeDeps({
        getAdvertisedEndpointSettings: () => ({
          advertisedUrl: "https://tunnel.example.com",
          advertisedUrlEnabled: false,
        }),
        insertPairingCode: (input) => ({
          ok: true,
          value: {
            id: "pair_5",
            createdAt: input.createdAt,
            expiresAt: input.expiresAt,
            state: "active",
          },
        }),
      }),
    )

    const result = await createPairingCode({})

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.endpoint).toBe(LOOPBACK_ENDPOINT)
  })

  test("rejects an explicit advertised choice when advertising is unavailable", async () => {
    const createPairingCode = makeCreatePairingCode(
      makeDeps({
        getAdvertisedEndpointSettings: () => ({
          advertisedUrl: null,
          advertisedUrlEnabled: true,
        }),
      }),
    )

    const result = await createPairingCode({ endpoint: "advertised" })

    expect(result).toEqual({
      ok: false,
      error: { kind: "advertised_endpoint_unavailable" },
    })
  })

  test("rejects an explicit advertised choice when advertising is disabled", async () => {
    const createPairingCode = makeCreatePairingCode(
      makeDeps({
        getAdvertisedEndpointSettings: () => ({
          advertisedUrl: "https://tunnel.example.com",
          advertisedUrlEnabled: false,
        }),
      }),
    )

    const result = await createPairingCode({ endpoint: "advertised" })

    expect(result).toEqual({
      ok: false,
      error: { kind: "advertised_endpoint_unavailable" },
    })
  })

  test("propagates an insert failure", async () => {
    const createPairingCode = makeCreatePairingCode(
      makeDeps({
        insertPairingCode: () => ({
          ok: false,
          error: { kind: "pairing_code_not_found" as const },
        }),
      }),
    )

    const result = await createPairingCode({ endpoint: "loopback" })

    expect(result).toEqual({
      ok: false,
      error: { kind: "pairing_code_not_found" },
    })
  })
})
