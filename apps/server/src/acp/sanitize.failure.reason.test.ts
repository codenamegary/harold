import { describe, expect, test } from "bun:test"
import { createAcpJsonRpcError } from "./transport/json.rpc.error"
import { sanitizeFailureReason } from "./sanitize.failure.reason"

describe("sanitizeFailureReason", () => {
  test("prefers a data message on an ACP JSON-RPC error", () => {
    const error = createAcpJsonRpcError({
      message: "request failed",
      data: { message: "agent rejected the prompt" },
    })

    expect(sanitizeFailureReason(error, "fallback")).toBe("agent rejected the prompt")
  })

  test("falls back to the error message on an ACP JSON-RPC error without data", () => {
    const error = createAcpJsonRpcError("transport died")

    expect(sanitizeFailureReason(error, "fallback")).toBe("transport died")
  })

  test("uses a plain Error message", () => {
    expect(sanitizeFailureReason(new Error("spawn failed"), "fallback")).toBe("spawn failed")
  })

  test("uses the fallback for non-Error throws", () => {
    expect(sanitizeFailureReason("just a string", "spawn blew up")).toBe("spawn blew up")
    expect(sanitizeFailureReason(undefined, "spawn blew up")).toBe("spawn blew up")
  })

  test("redacts bearer secrets from error messages", () => {
    const error = new Error("auth failed for Bearer abcd1234efgh5678")

    expect(sanitizeFailureReason(error, "fallback")).toBe("auth failed for Bearer [redacted]")
  })

  test("maps an empty message to the protocol error phrase", () => {
    expect(sanitizeFailureReason(new Error("   "), "fallback")).toBe("ACP protocol error")
  })
})
