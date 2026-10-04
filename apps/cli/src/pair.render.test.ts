import { describe, expect, test } from "bun:test"
import { CreatePairingCodeResponse } from "contracts/http/pairing-code"
import { renderPairingJson, renderPairingSummary } from "./pair.render"

const colors = {
  bold: (text: string) => `**${text}**`,
  dim: (text: string) => `_${text}_`,
}

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

describe("renderPairingSummary", () => {
  test("prints the code, endpoint, and expiry in an aligned block", () => {
    const text = renderPairingSummary({
      code: "R7K-4MP",
      endpoint: "http://127.0.0.1:3847",
      expiresAt: "2026-10-04T17:20:00.000Z",
      colors,
    })

    expect(text).toContain("**R7K-4MP**")
    expect(text).toContain("http://127.0.0.1:3847")
    expect(text).toContain("2026-10-04T17:20:00.000Z")
    expect(text).toContain("  code      ")
    expect(text).toContain("  endpoint  ")
  })
})

describe("renderPairingJson", () => {
  test("emits the pairing code and its scan URI as parseable JSON", () => {
    const text = renderPairingJson({
      pairing: aPairing(),
      qrUri: "harold://pair?v=1&endpoint=http%3A%2F%2F127.0.0.1%3A3847&code=R7K-4MP",
    })

    expect(text).not.toContain("\n")
    expect(JSON.parse(text)).toEqual({
      id: "pair_1",
      code: "R7K-4MP",
      endpoint: "http://127.0.0.1:3847",
      state: "active",
      createdAt: "2026-10-04T17:10:00.000Z",
      expiresAt: "2026-10-04T17:20:00.000Z",
      qrUri: "harold://pair?v=1&endpoint=http%3A%2F%2F127.0.0.1%3A3847&code=R7K-4MP",
    })
  })
})
