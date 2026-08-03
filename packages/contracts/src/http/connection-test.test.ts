import { describe, expect, test } from "bun:test"
import { ConnectionTestResponseSchema } from "./connection-test"

describe("ConnectionTestResponseSchema", () => {
  test("accepts a full result with gate flags", () => {
    const payload = {
      advertisedUrl: "https://agents.example.com",
      checkedAt: "2026-08-03T12:00:00.000Z",
      checks: [
        { id: "dns", status: "pass", message: "Resolved agents.example.com" },
        { id: "tls", status: "warn", message: "Certificate is self-signed" },
        { id: "device-auth", status: "pass", message: "Bearer auth succeeded" },
      ],
      canContinue: false,
      canContinueAnyway: true,
    }

    expect(ConnectionTestResponseSchema.parse(payload)).toEqual(payload)
  })

  test("rejects missing checks", () => {
    expect(() =>
      ConnectionTestResponseSchema.parse({
        advertisedUrl: "https://agents.example.com",
        checkedAt: "2026-08-03T12:00:00.000Z",
        checks: [{ id: "dns", status: "pass", message: "ok" }],
        canContinue: false,
        canContinueAnyway: false,
      }),
    ).toThrow()
  })
})
