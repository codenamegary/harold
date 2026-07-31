import { describe, expect, test } from "bun:test"
import {
  ClaimPairingCodeBodySchema,
  ClaimPairingCodeResponseSchema,
  CreatePairingCodeBodySchema,
  CreatePairingCodeResponseSchema,
  PAIRING_CODES_PATH,
  PairingCodeSchema,
  PairingCodeValueSchema,
  claimPairingCodePath,
} from "./pairing-code"

const validPairingCode = {
  id: "pair_01JFC8C7E77NQCFH0RF9Z22JHH",
  code: "R7K-4MP",
  endpoint: "http://127.0.0.1:3847",
  state: "active",
  createdAt: "2026-07-24T12:00:00.000Z",
  expiresAt: "2026-07-24T12:10:00.000Z",
} as const

const validDevice = {
  id: "device_01JFC8C7E77NQCFH0RF9Z22JHH",
  name: "Pixel 8",
  platform: "android",
  state: "online",
  pairedAt: "2026-07-24T12:00:00.000Z",
  lastSeenAt: "2026-07-24T12:00:00.000Z",
} as const

describe("PAIRING_CODES_PATH", () => {
  test("is the public pairing-codes resource", () => {
    expect(PAIRING_CODES_PATH).toBe("/v1/pairing-codes")
  })

  test("builds the claim sub-resource path", () => {
    expect(claimPairingCodePath("R7K-4MP")).toBe("/v1/pairing-codes/R7K-4MP/claim")
  })
})

describe("PairingCodeValueSchema", () => {
  test("accepts prototype XXX-XXX codes", () => {
    expect(PairingCodeValueSchema.parse("R7K-4MP")).toBe("R7K-4MP")
  })

  test("rejects lowercase codes", () => {
    expect(() => PairingCodeValueSchema.parse("r7k-4mp")).toThrow()
  })

  test("rejects codes without separator", () => {
    expect(() => PairingCodeValueSchema.parse("R7K4MP")).toThrow()
  })

  test("rejects codes with wrong length", () => {
    expect(() => PairingCodeValueSchema.parse("R7-4MP")).toThrow()
  })
})

describe("PairingCodeSchema", () => {
  test("accepts a valid pairing code", () => {
    expect(PairingCodeSchema.parse(validPairingCode)).toEqual(validPairingCode)
  })

  test("accepts claimed, expired, and revoked states", () => {
    for (const state of ["claimed", "expired", "revoked"] as const) {
      expect(PairingCodeSchema.parse({ ...validPairingCode, state }).state).toBe(
        state,
      )
    }
  })

  test("rejects invalid endpoint", () => {
    expect(() =>
      PairingCodeSchema.parse({ ...validPairingCode, endpoint: "not-a-url" }),
    ).toThrow()
  })

  test("rejects prototype serverPublicKey", () => {
    expect(() =>
      PairingCodeSchema.parse({
        ...validPairingCode,
        serverPublicKey: "ed25519:VbJ6b7eJ3ALqPqv1i5bZp7VYXtwzmWQ0VmJkLaJgW8A",
      }),
    ).toThrow()
  })

  test("rejects code hash fields on the public resource", () => {
    expect(() =>
      PairingCodeSchema.parse({
        ...validPairingCode,
        codeHash: "argon2id$...",
      }),
    ).toThrow()
  })
})

describe("CreatePairingCodeBodySchema", () => {
  test("accepts an empty body", () => {
    expect(CreatePairingCodeBodySchema.parse({})).toEqual({})
  })

  test("rejects client-supplied code", () => {
    expect(() =>
      CreatePairingCodeBodySchema.parse({ code: "R7K-4MP" }),
    ).toThrow()
  })
})

describe("CreatePairingCodeResponseSchema", () => {
  test("accepts the pairing code resource", () => {
    expect(CreatePairingCodeResponseSchema.parse(validPairingCode)).toEqual(
      validPairingCode,
    )
  })
})

describe("ClaimPairingCodeBodySchema", () => {
  test("accepts an empty claim body", () => {
    expect(ClaimPairingCodeBodySchema.parse({})).toEqual({})
  })

  test("accepts display name and platform hint", () => {
    const body = { name: "Pixel 8", platform: "android" }

    expect(ClaimPairingCodeBodySchema.parse(body)).toEqual(body)
  })

  test("rejects empty name", () => {
    expect(() => ClaimPairingCodeBodySchema.parse({ name: "" })).toThrow()
  })

  test("rejects name over 80 characters", () => {
    expect(() =>
      ClaimPairingCodeBodySchema.parse({ name: "a".repeat(81) }),
    ).toThrow()
  })

  test("rejects empty platform", () => {
    expect(() => ClaimPairingCodeBodySchema.parse({ platform: "" })).toThrow()
  })

  test("rejects credential on claim request", () => {
    expect(() =>
      ClaimPairingCodeBodySchema.parse({
        name: "Pixel 8",
        credential: "should-not-be-here",
      }),
    ).toThrow()
  })
})

describe("ClaimPairingCodeResponseSchema", () => {
  test("accepts device and one-time credential", () => {
    const response = {
      device: validDevice,
      credential: "devcred_opaque_high_entropy_secret_value",
    }

    expect(ClaimPairingCodeResponseSchema.parse(response)).toEqual(response)
  })

  test("rejects claim response without credential", () => {
    expect(() =>
      ClaimPairingCodeResponseSchema.parse({ device: validDevice }),
    ).toThrow()
  })
})
