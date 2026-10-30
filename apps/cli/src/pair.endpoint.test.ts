import { describe, expect, test } from "bun:test"
import { AdvertisedEndpointEntry } from "core/network/advertised.endpoints"
import { VerifyAdvertisedEndpointResult } from "core/reachability/models"
import { EndpointPromptPort, resolvePairingEndpoint } from "./pair.endpoint"

const LAN = "http://192.168.1.20:3847"
const OTHER = "http://10.0.0.5:3847"

const entry = (
  url: string,
  source: "detected" | "manual" = "detected",
): AdvertisedEndpointEntry => ({
  url,
  source,
  lastUsedAt: "2026-10-01T00:00:00.000Z",
})

const makeVerify =
  (reachable: ReadonlyArray<string>): ReturnType<typeof makeVerifyDeps>["verifyEndpoint"] =>
  async (url) => {
    const result: VerifyAdvertisedEndpointResult = reachable.includes(url)
      ? { ok: true, value: { advertisedUrl: url, statusUrl: `${url}/v1/status`, httpStatus: 200 } }
      : { ok: false, error: { kind: "unreachable", detail: "connect ECONNREFUSED" } }
    return result
  }

type HarnessParams = Readonly<{
  history?: ReadonlyArray<AdvertisedEndpointEntry>
  detected?: string | null
  reachable?: ReadonlyArray<string>
  explicitUrl?: string
  isInteractive?: boolean
  selectAnswer?: string | symbol
  textAnswers?: ReadonlyArray<string | symbol>
}>

const makeHarness = (params: HarnessParams = {}) => {
  const written: string[] = []
  const selectCalls: Array<{
    message: string
    options: ReadonlyArray<{ value: string; label: string }>
  }> = []
  const textCalls: string[] = []
  let textIndex = 0

  const prompts: EndpointPromptPort = {
    select: async (message, options) => {
      selectCalls.push({ message, options })
      return params.selectAnswer ?? options[0]?.value ?? Symbol("cancel")
    },
    text: async (message) => {
      textCalls.push(message)
      const answer = params.textAnswers?.[textIndex] ?? ""
      textIndex += 1
      return answer
    },
    isCancel: (value) => typeof value === "symbol",
  }

  const deps = {
    explicitUrl: params.explicitUrl,
    readHistory: () => params.history ?? [],
    detectLanAddress: () => (params.detected === undefined ? "192.168.1.20" : params.detected),
    port: 3847,
    verifyEndpoint: makeVerify(params.reachable ?? [LAN]),
    isInteractive: params.isInteractive ?? false,
    prompts,
    writeLine: (line: string) => written.push(line),
  }

  return { deps, written, selectCalls, textCalls }
}

describe("resolvePairingEndpoint", () => {
  test("an explicit URL wins and is probed once", async () => {
    const harness = makeHarness({
      explicitUrl: "https://harold.example.com",
      reachable: ["https://harold.example.com"],
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result).toEqual({ ok: true, url: "https://harold.example.com", source: "manual" })
  })

  test("an explicit unreachable URL fails without falling back", async () => {
    const harness = makeHarness({ explicitUrl: "http://192.168.1.99:3847", reachable: [] })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain("http://192.168.1.99:3847")
    expect(result.message).toContain("not reachable")
  })

  test("the most recent reachable history entry wins over fresh detection", async () => {
    const harness = makeHarness({
      history: [entry(OTHER, "manual"), entry(LAN)],
      reachable: [OTHER, LAN],
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result).toEqual({ ok: true, url: OTHER, source: "manual" })
  })

  test("falls back to the detected LAN address when history has no reachable entry", async () => {
    const harness = makeHarness({
      history: [entry(OTHER)],
      reachable: [LAN],
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result).toEqual({ ok: true, url: LAN, source: "detected" })
  })

  test("an explicit choice records source manual even when it matches history", async () => {
    const harness = makeHarness({
      explicitUrl: LAN,
      history: [entry(LAN)],
      reachable: [LAN],
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result).toEqual({ ok: true, url: LAN, source: "manual" })
  })

  test("when nothing is reachable, non-interactive runs fail and list what was probed", async () => {
    const harness = makeHarness({
      history: [entry(OTHER)],
      reachable: [],
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).toContain(OTHER)
    expect(result.message).toContain(LAN)
  })

  test("when nothing is reachable, interactive runs prompt for a custom URL", async () => {
    const harness = makeHarness({
      history: [entry(OTHER)],
      reachable: ["https://harold.example.com"],
      isInteractive: true,
      textAnswers: ["https://harold.example.com"],
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result).toEqual({ ok: true, url: "https://harold.example.com", source: "manual" })
    expect(harness.textCalls).toHaveLength(1)
  })

  test("interactive ambiguity prompts a selection between reachable candidates", async () => {
    const harness = makeHarness({
      history: [entry(OTHER, "manual")],
      reachable: [OTHER, LAN],
      isInteractive: true,
      selectAnswer: LAN,
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result).toEqual({ ok: true, url: LAN, source: "detected" })
    expect(harness.selectCalls).toHaveLength(1)
    const options = harness.selectCalls[0]?.options ?? []
    expect(options.map((option) => option.value)).toEqual([OTHER, LAN, "__custom__"])
  })

  test("a single reachable candidate never prompts", async () => {
    const harness = makeHarness({
      reachable: [LAN],
      isInteractive: true,
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result.ok).toBe(true)
    expect(harness.selectCalls).toHaveLength(0)
  })

  test("cancelling the selection fails the resolution", async () => {
    const harness = makeHarness({
      history: [entry(OTHER, "manual")],
      reachable: [OTHER, LAN],
      isInteractive: true,
      selectAnswer: Symbol("cancel"),
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result.ok).toBe(false)
  })

  test("loopback never comes from detection, only from an explicit URL or history", async () => {
    const harness = makeHarness({
      detected: "127.0.0.1",
      reachable: [],
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.message).not.toContain("http://127.0.0.1:3847/v1")
  })
})
