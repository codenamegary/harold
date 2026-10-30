import { describe, expect, test } from "bun:test"
import {
  CreatePairingCodeResponseSchema,
  PairingCodeValueSchema,
} from "contracts/http/pairing-code"
import { verifyPairingCode } from "./device.hash.pairing.code"
import { makeCreatePairingCode } from "./device.create.pairing.code.usecase"

const LAN_ENDPOINT = "http://192.168.1.20:3847"

// Endpoint selection lives with the caller (the CLI pair flow resolves and
// probes the endpoint). The use case only issues codes against what it is
// given (#458).
const makeDeps = (overrides: Partial<Parameters<typeof makeCreatePairingCode>[0]> = {}) => ({
  insertPairingCode: () => {
    throw new Error("insertPairingCode should not be called")
  },
  ...overrides,
})

describe("create pairing code use case", () => {
  test("creates a code against the endpoint the caller passes", async () => {
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

    const result = await createPairingCode(LAN_ENDPOINT)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const response = CreatePairingCodeResponseSchema.parse(result.value)
    expect(response.endpoint).toBe(LAN_ENDPOINT)
    expect(response.state).toBe("active")
    expect(response.id).toMatch(/^pair_/)
    expect(PairingCodeValueSchema.safeParse(response.code).success).toBe(true)
    expect(await verifyPairingCode({ code: response.code, codeHash: insertedCodeHash })).toBe(true)
    expect(Date.parse(response.expiresAt) - Date.parse(response.createdAt)).toBe(10 * 60 * 1000)
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

    const result = await createPairingCode(LAN_ENDPOINT)

    expect(result).toEqual({
      ok: false,
      error: { kind: "pairing_code_not_found" },
    })
  })
})
