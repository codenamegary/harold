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
  addresses?: ReadonlyArray<string>
  reachable?: ReadonlyArray<string>
  explicitUrl?: string
  isInteractive?: boolean
  selectAnswers?: ReadonlyArray<string | symbol>
  textAnswers?: ReadonlyArray<string | symbol>
}>

const makeHarness = (params: HarnessParams = {}) => {
  const written: string[] = []
  const selectCalls: Array<{
    message: string
    options: ReadonlyArray<{ value: string; label: string; hint?: string }>
    initialValue?: string
  }> = []
  const textCalls: string[] = []
  let textIndex = 0
  let selectIndex = 0
  const selectAnswers = params.selectAnswers ?? []

  const prompts: EndpointPromptPort = {
    select: async (message, options, initialValue) => {
      selectCalls.push({ message, options, initialValue })
      const answer = selectAnswers[selectIndex]
      selectIndex += 1
      return answer ?? options[0]?.value ?? Symbol("cancel")
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
    listLanAddresses: () =>
      (params.addresses ?? ["192.168.1.20", "10.0.0.236"]).map((address, index) => ({
        address,
        name: `eth${index}`,
      })),
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

  test("when nothing is reachable, interactive runs still list every candidate", async () => {
    const harness = makeHarness({
      history: [entry(OTHER)],
      reachable: [],
      isInteractive: true,
      selectAnswers: [Symbol("cancel")],
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result.ok).toBe(false)
    expect(harness.selectCalls).toHaveLength(1)
    const options = harness.selectCalls[0]?.options ?? []
    expect(options.map((option) => option.value)).toEqual([
      OTHER,
      "http://192.168.1.20:3847",
      "http://10.0.0.236:3847",
      "__custom__",
    ])
    for (const option of options) {
      if (option.value !== "__custom__") {
        expect(option.hint).toContain("unreachable")
      }
    }
  })

  test("interactive runs list history first, then interface addresses, MRU selected", async () => {
    const harness = makeHarness({
      history: [entry(OTHER, "manual"), entry(LAN)],
      reachable: [OTHER, LAN],
      isInteractive: true,
    })

    const result = await resolvePairingEndpoint(harness.deps)

    // The harness answers with the first option when nothing is scripted,
    // which is the default selection.
    expect(result).toEqual({ ok: true, url: OTHER, source: "manual" })
    const options = harness.selectCalls[0]?.options ?? []
    expect(options.map((option) => option.value)).toEqual([
      OTHER,
      LAN,
      "http://10.0.0.236:3847",
      "__custom__",
    ])
    expect(harness.selectCalls[0]?.initialValue).toBe(OTHER)
    expect(harness.selectCalls[0]?.options[0]?.hint).toContain("manual")
  })

  test("interface addresses carry the interface name and loopback never appears", async () => {
    const harness = makeHarness({
      addresses: ["127.0.0.1", "192.168.1.20"],
      reachable: [LAN],
      isInteractive: true,
      selectAnswers: [LAN],
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result).toEqual({ ok: true, url: LAN, source: "detected" })
    const options = harness.selectCalls[0]?.options ?? []
    expect(options.map((option) => option.value)).toEqual([LAN, "__custom__"])
    expect(harness.selectCalls[0]?.options[0]?.hint).toContain("eth1")
  })

  test("selecting an unreachable candidate warns and re-prompts", async () => {
    const harness = makeHarness({
      history: [entry(OTHER, "manual")],
      reachable: [LAN],
      isInteractive: true,
      selectAnswers: [OTHER, LAN],
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result).toEqual({ ok: true, url: LAN, source: "detected" })
    expect(harness.selectCalls).toHaveLength(2)
    expect(harness.written.join("\n")).toContain(OTHER)
    expect(harness.written.join("\n")).toContain("not reachable")
  })

  test("the custom URL option verifies the entered endpoint", async () => {
    const harness = makeHarness({
      reachable: ["https://harold.example.com"],
      isInteractive: true,
      selectAnswers: ["__custom__"],
      textAnswers: ["https://harold.example.com"],
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result).toEqual({ ok: true, url: "https://harold.example.com", source: "manual" })
    expect(harness.textCalls).toHaveLength(1)
  })

  test("cancelling the selection fails the resolution", async () => {
    const harness = makeHarness({
      reachable: [LAN],
      isInteractive: true,
      selectAnswers: [Symbol("cancel")],
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result.ok).toBe(false)
  })

  test("non-interactive runs never prompt and take the first reachable candidate", async () => {
    const harness = makeHarness({
      history: [entry(OTHER, "manual"), entry(LAN)],
      reachable: [OTHER, LAN],
    })

    const result = await resolvePairingEndpoint(harness.deps)

    expect(result).toEqual({ ok: true, url: OTHER, source: "manual" })
    expect(harness.selectCalls).toHaveLength(0)
  })
})
