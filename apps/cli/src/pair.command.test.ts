import { describe, expect, test } from "bun:test"
import { CreatePairingCodeResponse } from "contracts/http/pairing-code"
import { PairingCodeSnapshot } from "core/device/ports"
import { executePair, PairActionDeps } from "./pair.command"

const FUTURE = "2099-01-01T00:00:00.000Z"
const NOW = Date.parse("2026-10-04T17:10:05.000Z")

const aPairing = (
  overrides: Partial<CreatePairingCodeResponse> = {},
): CreatePairingCodeResponse => ({
  id: "pair_1",
  code: "R7K-4MP",
  endpoint: "http://127.0.0.1:3847",
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
  createCalls: Array<{ endpoint?: "loopback" | "advertised" }>
  qrCalls: string[]
  readCount: () => number
}>

const makeHarness = (
  params: {
    snapshots?: PairingCodeSnapshot[]
    createResult?:
      | { ok: true; value: CreatePairingCodeResponse }
      | { ok: false; error: { kind: "advertised_endpoint_unavailable" } }
  } = {},
): Harness => {
  const out: string[] = []
  const err: string[] = []
  const createCalls: Array<{ endpoint?: "loopback" | "advertised" }> = []
  const qrCalls: string[] = []
  let reads = 0

  const snapshots = params.snapshots ?? [aSnapshot({ state: "claimed" })]
  const createResult = params.createResult ?? { ok: true, value: aPairing() }

  const deps: PairActionDeps = {
    createPairingCode: async (body) => {
      createCalls.push(body ?? {})
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
  test("renders the summary and QR, then reports a successful claim", async () => {
    const harness = makeHarness()

    const exitCode = await executePair(harness.deps, {
      endpoint: undefined,
      wait: true,
      json: false,
    })

    expect(exitCode).toBe(0)
    expect(harness.createCalls).toEqual([{}])
    expect(harness.out.join("\n")).toContain("**R7K-4MP**")
    expect(harness.out.join("\n")).toContain("http://127.0.0.1:3847")
    expect(harness.out).toContain("Waiting for a device to scan...")
    expect(harness.out).toContain("Device paired.")
    expect(harness.qrCalls).toEqual([
      "harold://pair?v=1&endpoint=http%3A%2F%2F127.0.0.1%3A3847&code=R7K-4MP",
    ])
  })

  test("passes an explicit advertised endpoint choice through", async () => {
    const harness = makeHarness()

    await executePair(harness.deps, { endpoint: "advertised", wait: false, json: false })

    expect(harness.createCalls).toEqual([{ endpoint: "advertised" }])
  })

  test("--no-wait exits after rendering without polling", async () => {
    const harness = makeHarness()

    const exitCode = await executePair(harness.deps, {
      endpoint: undefined,
      wait: false,
      json: false,
    })

    expect(exitCode).toBe(0)
    expect(harness.readCount()).toBe(0)
    expect(harness.out.join("\n")).not.toContain("Waiting for a device to scan...")
    expect(harness.out.join("\n")).toContain("**R7K-4MP**")
  })

  test("--json emits a parseable pairing document and skips the terminal QR", async () => {
    const harness = makeHarness()

    const exitCode = await executePair(harness.deps, {
      endpoint: undefined,
      wait: false,
      json: true,
    })

    expect(exitCode).toBe(0)
    expect(harness.qrCalls).toEqual([])
    expect(harness.out).toHaveLength(1)
    expect(JSON.parse(harness.out[0])).toEqual({
      id: "pair_1",
      code: "R7K-4MP",
      endpoint: "http://127.0.0.1:3847",
      state: "active",
      createdAt: "2026-10-04T17:10:00.000Z",
      expiresAt: "2026-10-04T17:20:00.000Z",
      qrUri: "harold://pair?v=1&endpoint=http%3A%2F%2F127.0.0.1%3A3847&code=R7K-4MP",
    })
  })

  test("--json with waiting emits the pairing then a claimed result", async () => {
    const harness = makeHarness()

    const exitCode = await executePair(harness.deps, {
      endpoint: undefined,
      wait: true,
      json: true,
    })

    expect(exitCode).toBe(0)
    expect(harness.out).toHaveLength(2)
    expect(JSON.parse(harness.out[1])).toEqual({
      state: "claimed",
      pairingCodeId: "pair_1",
    })
  })

  test("reports an unavailable advertised endpoint", async () => {
    const harness = makeHarness({
      createResult: { ok: false, error: { kind: "advertised_endpoint_unavailable" } },
    })

    const exitCode = await executePair(harness.deps, {
      endpoint: "advertised",
      wait: false,
      json: false,
    })

    expect(exitCode).toBe(1)
    expect(harness.err.join("\n")).toContain("Advertised endpoint is not available")
  })

  test("reports a wait failure when the code expires", async () => {
    const harness = makeHarness({
      snapshots: [aSnapshot({ state: "expired", expiresAt: "2000-01-01T00:00:00.000Z" })],
    })

    const exitCode = await executePair(harness.deps, {
      endpoint: undefined,
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
      endpoint: undefined,
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
