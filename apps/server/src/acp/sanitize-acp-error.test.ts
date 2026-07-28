import { describe, expect, test } from "bun:test"
import { sanitizeAcpErrorMessage } from "./sanitize-acp-error"

describe("sanitizeAcpErrorMessage", () => {
  test("redacts bearer tokens and long key-like blobs", () => {
    const secret = "sk_live_abcdefghijklmnopqrstuvwxyz123456"
    const message = `session/load failed: Bearer ${secret} authorization: ${secret}`

    const sanitized = sanitizeAcpErrorMessage(message)

    expect(sanitized).not.toContain(secret)
    expect(sanitized).toContain("Bearer [redacted]")
    expect(sanitized).toContain("authorization: [redacted]")
  })

  test("maps transport failures to stable phrases", () => {
    expect(sanitizeAcpErrorMessage("connect ECONNREFUSED 127.0.0.1:1234")).toBe(
      "ACP transport connection refused",
    )
    expect(sanitizeAcpErrorMessage("read EPIPE")).toBe("ACP transport pipe closed")
  })
})
