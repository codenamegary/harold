import { describe, expect, test } from "bun:test"
import { redactPairingCodeInUrl } from "./redact.pairing.code.in.url"

describe("redactPairingCodeInUrl", () => {
  test("redacts pairing code segment in claim path", () => {
    expect(redactPairingCodeInUrl("/v1/pairing-codes/J7K-9P2/claim")).toBe(
      "/v1/pairing-codes/[redacted]/claim",
    )
  })

  test("leaves unrelated paths unchanged", () => {
    expect(redactPairingCodeInUrl("/v1/devices")).toBe("/v1/devices")
  })
})
