import { describe, expect, test } from "bun:test"
import {
  ACTIONABLE_SESSION_LOAD_DETAIL,
  sanitizeAcpErrorMessage,
  sanitizeAcpRejection,
} from "./sanitize-acp-error"

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

  test("maps bare Invalid params to actionable load detail", () => {
    expect(sanitizeAcpErrorMessage("Invalid params")).toBe(ACTIONABLE_SESSION_LOAD_DETAIL)
  })

  test("maps bare session-not-found signals to actionable load detail", () => {
    expect(sanitizeAcpErrorMessage("session-not-found")).toBe(ACTIONABLE_SESSION_LOAD_DETAIL)
    expect(sanitizeAcpErrorMessage("Session not found")).toBe(ACTIONABLE_SESSION_LOAD_DETAIL)
  })
})

describe("sanitizeAcpRejection", () => {
  test("prefers sanitized error.data.message when present", () => {
    const secret = "sk_live_abcdefghijklmnopqrstuvwxyz123456"
    const detail = sanitizeAcpRejection({
      message: "Invalid params",
      data: { message: `Session missing: Bearer ${secret}` },
    })

    expect(detail).toContain("Session missing:")
    expect(detail).toContain("Bearer [redacted]")
    expect(detail).not.toContain(secret)
    expect(detail).not.toBe("Invalid params")
  })

  test("maps Invalid params without useful data to actionable load detail", () => {
    expect(
      sanitizeAcpRejection({
        message: "Invalid params",
      }),
    ).toBe(ACTIONABLE_SESSION_LOAD_DETAIL)

    expect(
      sanitizeAcpRejection({
        message: "Invalid params",
        data: { message: "Invalid params" },
      }),
    ).toBe(ACTIONABLE_SESSION_LOAD_DETAIL)
  })

  test("maps session-not-found without useful data to actionable load detail", () => {
    expect(
      sanitizeAcpRejection({
        message: "session-not-found",
      }),
    ).toBe(ACTIONABLE_SESSION_LOAD_DETAIL)
  })

  test("never echoes raw Invalid params for prompt or cancel failures", () => {
    const promptDetail = sanitizeAcpRejection({
      message: "Invalid params",
      data: undefined,
    })
    const cancelDetail = sanitizeAcpRejection({
      message: "Invalid params",
    })

    expect(promptDetail).toBe(ACTIONABLE_SESSION_LOAD_DETAIL)
    expect(cancelDetail).toBe(ACTIONABLE_SESSION_LOAD_DETAIL)
    expect(promptDetail).not.toBe("Invalid params")
    expect(cancelDetail).not.toBe("Invalid params")
  })

  test("keeps other rejection messages after secret redaction", () => {
    expect(
      sanitizeAcpRejection({
        message: "session/prompt failed: permission denied",
      }),
    ).toBe("session/prompt failed: permission denied")
  })
})
