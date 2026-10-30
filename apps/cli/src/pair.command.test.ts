import { describe, expect, test } from "bun:test"
import { CreatePairingCodeResponse } from "contracts/http/pairing-code"
import { PairingCodeSnapshot } from "core/device/ports"
import { executePair, PairActionDeps } from "./pair.command"

const FUTURE = "2099-01-01T00:00:00.000Z"
const NOW = Date.parse("2026-10-04T17:10:05.000Z")
const LAN_ENDPOINT = "http://192.168.1.20:3847"

const aPairing = (
  overrides: Partial<CreatePairingCodeResponse> = {},
): CreatePairingCodeResponse => ({
  id: "pair_1",
  code: "R7K-4MP",
  endpoint: LAN_ENDPOINT,
  state: "active",
  createdAt: "2026-10-04T17:10:00.000Z",
  expiresAt: "2026-10-04T17:20:00.000Z",
  ...overrides,
})

const aSnapshot = (overrides: Partial<PairingCodeSnapshot> = {}): PairingCodeSnapshot => ({
  id: "pair_1",
  codeHash: "hash",
  state: "active",
  expiresAt: FUTURE,
  ...overrides,
})

const colors = {
  bold: (text: string) => `**${text}**`,
  dim: (text: string) => `_${text}_`,
}

type Harness = Readonly<{
  deps: PairActionDeps
  out: string[]
  err: string[]
  createCalls: string[]
  qrCalls: string[]
  readCount: () => number
}>

const makeHarness = (
  params: {
    snapshots?: PairingCodeSnapshot[]
    createResult?:
      | { ok: true; value: CreatePairingCodeResponse }
      | { ok: false; error: { kind: "pairing_code_not_found" } }
  } = {},
): Harness => {
  const out: string[] = []
  const err: string[] = []
  const createCalls: string[] = []
  const qrCalls: string[] = []
  let reads = 0

  const snapshots = params.snapshots ?? [aSnapshot({ state: "claimed" })]
  const createResult = params.createResult ?? { ok: true, value: aPairing() }

  const deps: PairActionDeps = {
    createPairingCode: async (endpoint) => {
      createCalls.push(endpoint)
      return createResult
    },
    getPairingCodeById: () => {
      const snapshot = snapshots[Math.min(reads, snapshots.length - 1)]
      reads += 1
      return snapshot
    },
    renderTerminalQr: async (text) => {
      qrCalls.push(text)
      return `QR<${text}>`
    },
    colors,
    writeOut: (text) => out.push(text),
    writeErr: (text) => err.push(text),
    now: () => new Date(NOW),
    sleep: async () => {},
  }

  return { deps, out, err, createCalls, qrCalls, readCount: () => reads }
}

describe("executePair", () => {
  test("renders the summary and QR against the resolved endpoint, then reports the claim", async () => {
    const harness = makeHarness()

    const exitCode = await executePair(harness.deps, {
      endpoint: LAN_ENDPOINT,
      wait: true,
      json: false,
    })

    expect(exitCode).toBe(0)
    expect(harness.createCalls).toEqual([LAN_ENDPOINT])
    expect(harness.out.join("\n")).toContain("**R7K-4MP**")
    expect(harness.out.join("\n")).toContain(LAN_ENDPOINT)
    expect(harness.out).toContain("Waiting for a device to claim...")
    expect(harness.out).toContain("Device paired.")
    expect(harness.qrCalls).toEqual([
      "harold://pair?v=1&endpoint=http%3A%2F%2F192.168.1.20%3A3847&code=R7K-4MP",
    ])
  })

  test("renders the QR and the manual entry hint together, no mode prompt", async () => {
    const harness = makeHarness()

    const exitCode = await executePair(harness.deps, {
      endpoint: LAN_ENDPOINT,
      wait: false,
      json: false,
    })

    expect(exitCode).toBe(0)
    expect(harness.qrCalls).toHaveLength(1)
    expect(harness.out.join("\n")).toContain(LAN_ENDPOINT)
    expect(harness.out.join("\n")).toContain("R7K-4MP")
    expect(harness.out.join("\n")).toContain("Manual pairing")
  })

  test("--no-wait exits after rendering without polling", async () => {
    const harness = makeHarness()

    const exitCode = await executePair(harness.deps, {
      endpoint: LAN_ENDPOINT,
      wait: false,
      json: false,
    })

    expect(exitCode).toBe(0)
    expect(harness.readCount()).toBe(0)
    expect(harness.out.join("\n")).not.toContain("Waiting for a device to claim...")
    expect(harness.out.join("\n")).toContain("**R7K-4MP**")
  })

  test("--json emits a parseable pairing document and skips the terminal QR", async () => {
    const harness = makeHarness()

    const exitCode = await executePair(harness.deps, {
      endpoint: LAN_ENDPOINT,
      wait: false,
      json: true,
    })

    expect(exitCode).toBe(0)
    expect(harness.qrCalls).toEqual([])
    expect(harness.out).toHaveLength(1)
    expect(harness.out[0]).not.toContain("\n")
    expect(JSON.parse(harness.out[0])).toEqual({
      id: "pair_1",
      code: "R7K-4MP",
      endpoint: LAN_ENDPOINT,
      state: "active",
      createdAt: "2026-10-04T17:10:00.000Z",
      expiresAt: "2026-10-04T17:20:00.000Z",
      qrUri: "harold://pair?v=1&endpoint=http%3A%2F%2F192.168.1.20%3A3847&code=R7K-4MP",
    })
  })

  test("--json with waiting emits the pairing then a claimed result", async () => {
    const harness = makeHarness()

    const exitCode = await executePair(harness.deps, {
      endpoint: LAN_ENDPOINT,
      wait: true,
      json: true,
    })

    expect(exitCode).toBe(0)
    expect(harness.out).toHaveLength(2)
    for (const line of harness.out) {
      expect(line).not.toContain("\n")
      expect(() => JSON.parse(line)).not.toThrow()
    }
    expect(JSON.parse(harness.out[0])).toEqual({
      id: "pair_1",
      code: "R7K-4MP",
      endpoint: LAN_ENDPOINT,
      state: "active",
      createdAt: "2026-10-04T17:10:00.000Z",
      expiresAt: "2026-10-04T17:20:00.000Z",
      qrUri: "harold://pair?v=1&endpoint=http%3A%2F%2F192.168.1.20%3A3847&code=R7K-4MP",
    })
    expect(JSON.parse(harness.out[1])).toEqual({
      state: "claimed",
      pairingCodeId: "pair_1",
    })
  })

  test("reports a create failure", async () => {
    const harness = makeHarness({
      createResult: { ok: false, error: { kind: "pairing_code_not_found" } },
    })

    const exitCode = await executePair(harness.deps, {
      endpoint: LAN_ENDPOINT,
      wait: false,
      json: false,
    })

    expect(exitCode).toBe(1)
    expect(harness.err.join("\n")).toContain("Pairing code was removed")
  })

  test("--json emits a machine-readable create failure", async () => {
    const harness = makeHarness({
      createResult: { ok: false, error: { kind: "pairing_code_not_found" } },
    })

    const exitCode = await executePair(harness.deps, {
      endpoint: LAN_ENDPOINT,
      wait: false,
      json: true,
    })

    expect(exitCode).toBe(1)
    expect(harness.err).toHaveLength(1)
    expect(harness.err[0]).not.toContain("\n")
    expect(JSON.parse(harness.err[0])).toEqual({
      state: "pairing_code_not_found",
    })
  })

  test("reports a wait failure when the code expires", async () => {
    const harness = makeHarness({
      snapshots: [aSnapshot({ state: "expired", expiresAt: "2000-01-01T00:00:00.000Z" })],
    })

    const exitCode = await executePair(harness.deps, {
      endpoint: LAN_ENDPOINT,
      wait: true,
      json: false,
    })

    expect(exitCode).toBe(1)
    expect(harness.err.join("\n")).toContain("expired")
    expect(harness.out).not.toContain("Device paired.")
  })

  test("--json emits a machine-readable wait failure", async () => {
    const harness = makeHarness({
      snapshots: [aSnapshot({ state: "revoked" })],
    })

    const exitCode = await executePair(harness.deps, {
      endpoint: LAN_ENDPOINT,
      wait: true,
      json: true,
    })

    expect(exitCode).toBe(1)
    expect(JSON.parse(harness.err[0])).toEqual({
      state: "pairing_code_revoked",
      pairingCodeId: "pair_1",
    })
  })
})
