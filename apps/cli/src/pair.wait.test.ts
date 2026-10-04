import { describe, expect, test } from "bun:test"
import { DeviceError } from "core/device/errors"
import { PairingCodeSnapshot } from "core/device/ports"
import { waitForPairingClaim } from "./pair.wait"

const FUTURE = "2099-01-01T00:00:00.000Z"
const PAST = "2000-01-01T00:00:00.000Z"

const aSnapshot = (overrides: Partial<PairingCodeSnapshot> = {}): PairingCodeSnapshot => ({
  id: "pair_1",
  codeHash: "hash",
  state: "active",
  expiresAt: FUTURE,
  ...overrides,
})

const makeWait = (params: {
  snapshots: PairingCodeSnapshot[]
  clock: () => number
  pollIntervalMs?: number
}) => {
  const sleeps: number[] = []
  let reads = 0

  const wait = waitForPairingClaim({
    getPairingCodeById: () => {
      const snapshot = params.snapshots[Math.min(reads, params.snapshots.length - 1)]
      reads += 1
      return snapshot
    },
    now: () => new Date(params.clock()),
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    pollIntervalMs: params.pollIntervalMs,
  })

  return { wait, sleeps, readCount: () => reads }
}

describe("waitForPairingClaim", () => {
  test("resolves once the pairing code row is claimed", async () => {
    const { wait, sleeps } = makeWait({
      snapshots: [aSnapshot(), aSnapshot(), aSnapshot({ state: "claimed" })],
      clock: () => Date.parse("2026-10-04T17:10:05.000Z"),
      pollIntervalMs: 1000,
    })

    const result = await wait("pair_1")

    expect(result).toEqual({ ok: true, value: { pairingCodeId: "pair_1" } })
    expect(sleeps).toEqual([1000, 1000])
  })

  test("polls once per second by default", async () => {
    const { wait, sleeps } = makeWait({
      snapshots: [aSnapshot(), aSnapshot({ state: "claimed" })],
      clock: () => Date.parse("2026-10-04T17:10:05.000Z"),
    })

    await wait("pair_1")

    expect(sleeps).toEqual([1000])
  })

  test("fails as expired when the row flips to expired", async () => {
    const { wait } = makeWait({
      snapshots: [aSnapshot({ state: "expired", expiresAt: PAST })],
      clock: () => Date.parse("2026-10-04T17:10:05.000Z"),
    })

    expect(await wait("pair_1")).toEqual({
      ok: false,
      error: { kind: "pairing_code_expired" },
    })
  })

  test("fails as expired when the wall clock passes the expiry while still active", async () => {
    const { wait, sleeps } = makeWait({
      snapshots: [aSnapshot({ expiresAt: "2026-10-04T17:20:00.000Z" })],
      clock: () => Date.parse("2026-10-04T17:20:00.000Z"),
    })

    expect(await wait("pair_1")).toEqual({
      ok: false,
      error: { kind: "pairing_code_expired" },
    })
    expect(sleeps).toEqual([])
  })

  test("fails as revoked when the row flips to revoked", async () => {
    const { wait } = makeWait({
      snapshots: [aSnapshot({ state: "revoked" })],
      clock: () => Date.parse("2026-10-04T17:10:05.000Z"),
    })

    expect(await wait("pair_1")).toEqual({
      ok: false,
      error: { kind: "pairing_code_revoked" },
    })
  })

  test("fails as not found when the row disappears", async () => {
    const error: DeviceError = { kind: "pairing_code_not_found" }
    const wait = waitForPairingClaim({
      getPairingCodeById: () => undefined,
      now: () => new Date(Date.parse("2026-10-04T17:10:05.000Z")),
      sleep: async () => {},
    })

    expect(await wait("pair_1")).toEqual({ ok: false, error })
  })
})
