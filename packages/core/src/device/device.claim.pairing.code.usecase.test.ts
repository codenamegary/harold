import { describe, expect, test } from "bun:test"
import { Device } from "contracts/http/device"
import { makeClaimPairingCode } from "./device.claim.pairing.code.usecase"
import { hashPairingCode } from "./device.hash.pairing.code"
import { ClaimPairingCodeRowInput, PairingCodeSnapshot } from "./device.ports"

const FUTURE = "2099-01-01T00:00:00.000Z"
const PAST = "2000-01-01T00:00:00.000Z"

const aDevice = (overrides: Partial<Device> = {}): Device => ({
  id: "dev_1",
  name: "Test device",
  platform: null,
  state: "offline",
  pairedAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: null,
  ...overrides,
})

const aRow = (
  codeHash: string,
  overrides: Partial<PairingCodeSnapshot> = {},
): PairingCodeSnapshot => ({
  id: "pair_1",
  codeHash,
  state: "active",
  expiresAt: FUTURE,
  ...overrides,
})

const rowForCode = async (
  code: string,
  overrides: Partial<PairingCodeSnapshot> = {},
): Promise<PairingCodeSnapshot> => aRow(await hashPairingCode(code), overrides)

const makeDeps = (overrides: Partial<Parameters<typeof makeClaimPairingCode>[0]> = {}) => ({
  markExpiredActiveBefore: () => {
    throw new Error("markExpiredActiveBefore should not be called")
  },
  listActivePairingCodes: (): ReadonlyArray<PairingCodeSnapshot> => {
    throw new Error("listActivePairingCodes should not be called")
  },
  listPairingCodesByStates: () => {
    throw new Error("listPairingCodesByStates should not be called")
  },
  markPairingCodeExpired: () => {
    throw new Error("markPairingCodeExpired should not be called")
  },
  getPairingCodeById: () => {
    throw new Error("getPairingCodeById should not be called")
  },
  claimPairingCodeRow: () => {
    throw new Error("claimPairingCodeRow should not be called")
  },
  ...overrides,
})

describe("claim pairing code use case", () => {
  test("rejects a code that does not match the pairing code format", async () => {
    const claimPairingCode = makeClaimPairingCode(makeDeps())

    const result = await claimPairingCode({ code: "NOPE", body: {} })

    expect(result).toEqual({
      ok: false,
      error: { kind: "pairing_code_not_found" },
    })
  })

  test("expires stale active codes before matching", async () => {
    const calls: string[] = []
    const claimPairingCode = makeClaimPairingCode(
      makeDeps({
        markExpiredActiveBefore: () => {
          calls.push("markExpiredActiveBefore")
        },
        listActivePairingCodes: () => {
          calls.push("listActivePairingCodes")
          return []
        },
        listPairingCodesByStates: () => [],
      }),
    )

    await claimPairingCode({ code: "ABC-234", body: {} })

    expect(calls).toEqual(["markExpiredActiveBefore", "listActivePairingCodes"])
  })

  test("claims an active code and returns the device credential", async () => {
    const row = await rowForCode("ABC-234")
    let claimInput: ClaimPairingCodeRowInput | undefined

    const claimPairingCode = makeClaimPairingCode(
      makeDeps({
        markExpiredActiveBefore: () => {},
        listActivePairingCodes: () => [row],
        claimPairingCodeRow: (input) => {
          claimInput = input
          return { ok: true, value: aDevice({ name: input.name }) }
        },
      }),
    )

    const result = await claimPairingCode({
      code: "ABC-234",
      body: { name: "Pixel 9", platform: "android" },
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.device.name).toBe("Pixel 9")
    expect(result.value.credential.startsWith("devcred_")).toBe(true)
    expect(claimInput?.pairingCodeId).toBe("pair_1")
    expect(claimInput?.name).toBe("Pixel 9")
    expect(claimInput?.platform).toBe("android")
    expect(claimInput?.credentialHash.length).toBeGreaterThan(0)
  })

  test("applies the default device name when the body omits it", async () => {
    const row = await rowForCode("ABC-234")
    const claimPairingCode = makeClaimPairingCode(
      makeDeps({
        markExpiredActiveBefore: () => {},
        listActivePairingCodes: () => [row],
        claimPairingCodeRow: (input) => ({
          ok: true,
          value: aDevice({ name: input.name }),
        }),
      }),
    )

    const result = await claimPairingCode({ code: "ABC-234", body: {} })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.device.name).toBe("Paired device")
  })

  test("marks an expired active code as expired", async () => {
    const row = await rowForCode("ABC-234", { expiresAt: PAST })
    const expiredIds: string[] = []
    const claimPairingCode = makeClaimPairingCode(
      makeDeps({
        markExpiredActiveBefore: () => {},
        listActivePairingCodes: () => [row],
        markPairingCodeExpired: (input) => {
          expiredIds.push(input.id)
        },
      }),
    )

    const result = await claimPairingCode({ code: "ABC-234", body: {} })

    expect(result).toEqual({
      ok: false,
      error: { kind: "pairing_code_expired" },
    })
    expect(expiredIds).toEqual(["pair_1"])
  })

  test("maps a claim race to claimed when the code is already claimed", async () => {
    const row = await rowForCode("ABC-234")
    const claimPairingCode = makeClaimPairingCode(
      makeDeps({
        markExpiredActiveBefore: () => {},
        listActivePairingCodes: () => [row],
        claimPairingCodeRow: () => ({
          ok: false,
          error: { kind: "pairing_code_race" as const },
        }),
        getPairingCodeById: () => aRow("unused", { state: "claimed" }),
      }),
    )

    const result = await claimPairingCode({ code: "ABC-234", body: {} })

    expect(result).toEqual({
      ok: false,
      error: { kind: "pairing_code_claimed" },
    })
  })

  test("maps a claim race to expired when the code has since expired", async () => {
    const row = await rowForCode("ABC-234")
    const claimPairingCode = makeClaimPairingCode(
      makeDeps({
        markExpiredActiveBefore: () => {},
        listActivePairingCodes: () => [row],
        claimPairingCodeRow: () => ({
          ok: false,
          error: { kind: "pairing_code_race" as const },
        }),
        getPairingCodeById: () => aRow("unused", { state: "expired" }),
      }),
    )

    const result = await claimPairingCode({ code: "ABC-234", body: {} })

    expect(result).toEqual({
      ok: false,
      error: { kind: "pairing_code_expired" },
    })
  })

  test("maps a claim race to expired when the code deadline has passed", async () => {
    const row = await rowForCode("ABC-234")
    const claimPairingCode = makeClaimPairingCode(
      makeDeps({
        markExpiredActiveBefore: () => {},
        listActivePairingCodes: () => [row],
        claimPairingCodeRow: () => ({
          ok: false,
          error: { kind: "pairing_code_race" as const },
        }),
        getPairingCodeById: () => aRow("unused", { expiresAt: PAST }),
      }),
    )

    const result = await claimPairingCode({ code: "ABC-234", body: {} })

    expect(result).toEqual({
      ok: false,
      error: { kind: "pairing_code_expired" },
    })
  })

  test("maps a claim race to revoked when the code is revoked", async () => {
    const row = await rowForCode("ABC-234")
    const claimPairingCode = makeClaimPairingCode(
      makeDeps({
        markExpiredActiveBefore: () => {},
        listActivePairingCodes: () => [row],
        claimPairingCodeRow: () => ({
          ok: false,
          error: { kind: "pairing_code_race" as const },
        }),
        getPairingCodeById: () => aRow("unused", { state: "revoked" }),
      }),
    )

    const result = await claimPairingCode({ code: "ABC-234", body: {} })

    expect(result).toEqual({
      ok: false,
      error: { kind: "pairing_code_revoked" },
    })
  })

  test("maps a claim race to not found when the code is missing or still active", async () => {
    const row = await rowForCode("ABC-234")
    const claimWithLatest = (latest: PairingCodeSnapshot | undefined) =>
      makeClaimPairingCode(
        makeDeps({
          markExpiredActiveBefore: () => {},
          listActivePairingCodes: () => [row],
          claimPairingCodeRow: () => ({
            ok: false,
            error: { kind: "pairing_code_race" as const },
          }),
          getPairingCodeById: () => latest,
        }),
      )

    const missing = await claimWithLatest(undefined)({ code: "ABC-234", body: {} })
    expect(missing).toEqual({
      ok: false,
      error: { kind: "pairing_code_not_found" },
    })

    const stillActive = await claimWithLatest(aRow("unused"))({
      code: "ABC-234",
      body: {},
    })
    expect(stillActive).toEqual({
      ok: false,
      error: { kind: "pairing_code_not_found" },
    })
  })

  test("propagates non-race claim failures", async () => {
    const row = await rowForCode("ABC-234")
    const claimPairingCode = makeClaimPairingCode(
      makeDeps({
        markExpiredActiveBefore: () => {},
        listActivePairingCodes: () => [row],
        claimPairingCodeRow: () => ({
          ok: false,
          error: { kind: "device_not_found" as const },
        }),
      }),
    )

    const result = await claimPairingCode({ code: "ABC-234", body: {} })

    expect(result).toEqual({
      ok: false,
      error: { kind: "device_not_found" },
    })
  })

  test("reports claimed for a matched claimed code", async () => {
    const row = await rowForCode("ABC-234", { state: "claimed" })
    const claimPairingCode = makeClaimPairingCode(
      makeDeps({
        markExpiredActiveBefore: () => {},
        listActivePairingCodes: () => [],
        listPairingCodesByStates: () => [row],
      }),
    )

    const result = await claimPairingCode({ code: "ABC-234", body: {} })

    expect(result).toEqual({
      ok: false,
      error: { kind: "pairing_code_claimed" },
    })
  })

  test("reports revoked for a matched revoked code", async () => {
    const row = await rowForCode("ABC-234", { state: "revoked" })
    const claimPairingCode = makeClaimPairingCode(
      makeDeps({
        markExpiredActiveBefore: () => {},
        listActivePairingCodes: () => [],
        listPairingCodesByStates: () => [row],
      }),
    )

    const result = await claimPairingCode({ code: "ABC-234", body: {} })

    expect(result).toEqual({
      ok: false,
      error: { kind: "pairing_code_revoked" },
    })
  })

  test("reports expired for a matched expired code", async () => {
    const row = await rowForCode("ABC-234", { state: "expired" })
    const claimPairingCode = makeClaimPairingCode(
      makeDeps({
        markExpiredActiveBefore: () => {},
        listActivePairingCodes: () => [],
        listPairingCodesByStates: () => [row],
      }),
    )

    const result = await claimPairingCode({ code: "ABC-234", body: {} })

    expect(result).toEqual({
      ok: false,
      error: { kind: "pairing_code_expired" },
    })
  })

  test("reports not found when no code matches", async () => {
    const row = await rowForCode("ZZZ-999", { state: "claimed" })
    const claimPairingCode = makeClaimPairingCode(
      makeDeps({
        markExpiredActiveBefore: () => {},
        listActivePairingCodes: () => [],
        listPairingCodesByStates: () => [row],
      }),
    )

    const result = await claimPairingCode({ code: "ABC-234", body: {} })

    expect(result).toEqual({
      ok: false,
      error: { kind: "pairing_code_not_found" },
    })
  })
})
