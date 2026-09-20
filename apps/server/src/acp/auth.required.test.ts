import { describe, expect, test } from "bun:test"
import {
  ACP_AUTH_REQUIRED_CODE,
  isAcpAuthRequiredError,
  isAuthRequiredFailureReason,
} from "./auth.required"
import { createAcpJsonRpcError } from "./transport/json.rpc.error"

describe("isAcpAuthRequiredError", () => {
  test("detects ACP authentication required code", () => {
    expect(
      isAcpAuthRequiredError(
        createAcpJsonRpcError("Authentication required", ACP_AUTH_REQUIRED_CODE),
      ),
    ).toBe(true)
  })

  test("detects message-only auth required", () => {
    expect(isAcpAuthRequiredError(new Error("auth_required"))).toBe(true)
  })

  test("rejects unrelated errors", () => {
    expect(isAcpAuthRequiredError(createAcpJsonRpcError("boom", -32001))).toBe(false)
    expect(isAcpAuthRequiredError(new Error("session/prompt failed"))).toBe(false)
  })
})

describe("isAuthRequiredFailureReason", () => {
  test("matches auth required phrasing", () => {
    expect(isAuthRequiredFailureReason("Authentication required")).toBe(true)
    expect(isAuthRequiredFailureReason("auth_required")).toBe(true)
  })
})
