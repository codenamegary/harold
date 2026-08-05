import { describe, expect, test } from "bun:test"
import {
  formatPairingQrUri,
  parsePairingQrUri,
} from "./qr-uri"

describe("formatPairingQrUri", () => {
  test("builds the versioned custom URI", () => {
    const uri = formatPairingQrUri({
      endpoint: "https://agent.example.com",
      code: "R7K-4MP",
    })

    expect(uri).toBe(
      "agent-server://pair?v=1&endpoint=https%3A%2F%2Fagent.example.com&code=R7K-4MP",
    )
  })

  test("rejects invalid codes", () => {
    expect(() =>
      formatPairingQrUri({
        endpoint: "https://agent.example.com",
        code: "bad",
      }),
    ).toThrow()
  })
})

describe("parsePairingQrUri", () => {
  test("parses a formatted URI", () => {
    const uri = formatPairingQrUri({
      endpoint: "http://127.0.0.1:3847",
      code: "J7K-9P2",
    })

    expect(parsePairingQrUri(uri)).toEqual({
      version: 1,
      endpoint: "http://127.0.0.1:3847",
      code: "J7K-9P2",
    })
  })

  test("rejects unsupported versions", () => {
    const uri =
      "agent-server://pair?v=2&endpoint=https%3A%2F%2Fagent.example.com&code=R7K-4MP"

    expect(() => parsePairingQrUri(uri)).toThrow(/Unsupported pairing URI version/)
  })

  test("rejects duplicate required fields", () => {
    const uri =
      "agent-server://pair?v=1&v=1&endpoint=https%3A%2F%2Fagent.example.com&code=R7K-4MP"

    expect(() => parsePairingQrUri(uri)).toThrow(/Duplicate v parameter/)
  })

  test("rejects invalid codes", () => {
    const uri =
      "agent-server://pair?v=1&endpoint=https%3A%2F%2Fagent.example.com&code=bad"

    expect(() => parsePairingQrUri(uri)).toThrow()
  })

  test("rejects invalid endpoints", () => {
    const uri =
      "agent-server://pair?v=1&endpoint=not-a-url&code=R7K-4MP"

    expect(() => parsePairingQrUri(uri)).toThrow()
  })

  test("rejects legacy JSON payloads", () => {
    expect(() =>
      parsePairingQrUri(
        JSON.stringify({
          code: "R7K-4MP",
          endpoint: "http://127.0.0.1:3847",
        }),
      ),
    ).toThrow(/Legacy JSON/)
  })

  test("rejects cleartext endpoints when configured", () => {
    const uri = formatPairingQrUri({
      endpoint: "http://127.0.0.1:3847",
      code: "R7K-4MP",
    })

    expect(() =>
      parsePairingQrUri(uri, { rejectCleartext: true }),
    ).toThrow(/Cleartext endpoint/)
  })

  test("allows cleartext endpoints by default", () => {
    const uri = formatPairingQrUri({
      endpoint: "http://127.0.0.1:3847",
      code: "R7K-4MP",
    })

    expect(parsePairingQrUri(uri).endpoint).toBe("http://127.0.0.1:3847")
  })
})
