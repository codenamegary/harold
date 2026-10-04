import { describe, expect, test } from "bun:test"
import { formatPairingQrUri, parsePairingQrUri } from "contracts/pairing/qr-uri"
import { renderTerminalQr } from "./pair.qr"

describe("pairing QR", () => {
  test("encodes the harold://pair scan URI with the issued endpoint and code", () => {
    const uri = formatPairingQrUri({
      endpoint: "http://127.0.0.1:3847",
      code: "R7K-4MP",
    })

    expect(uri).toBe("harold://pair?v=1&endpoint=http%3A%2F%2F127.0.0.1%3A3847&code=R7K-4MP")
    expect(parsePairingQrUri(uri)).toEqual({
      version: 1,
      endpoint: "http://127.0.0.1:3847",
      code: "R7K-4MP",
    })
  })

  test("keeps the advertised tunnel endpoint intact in the scan URI", () => {
    const uri = formatPairingQrUri({
      endpoint: "https://tunnel.example.com",
      code: "J7K-9P2",
    })

    expect(parsePairingQrUri(uri).endpoint).toBe("https://tunnel.example.com")
  })

  test("renders the scan URI as UTF-8 terminal blocks", async () => {
    const uri = formatPairingQrUri({
      endpoint: "https://tunnel.example.com",
      code: "R7K-4MP",
    })

    const block = await renderTerminalQr(uri)
    const lines = block.split("\n").filter((line) => line.trim().length > 0)

    expect(lines.length).toBeGreaterThan(10)
    expect(block).toContain("\u2584")
  })
})
