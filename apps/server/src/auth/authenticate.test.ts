import { describe, expect, test } from "bun:test"
import { hashDeviceCredential } from "../device/device.hash.credential"
import { authenticate } from "./authenticate"
import { authorizeActiveFullOperator } from "./authorize"
import { parseAuthorizationHeader } from "./bearer"
import { isLoopbackRequest } from "./loopback"
import { formatPrincipal } from "./principal"
import { isOpenRoute } from "./route.policy"

describe("parseAuthorizationHeader", () => {
  test("missing header is not presented", () => {
    expect(parseAuthorizationHeader(undefined)).toEqual({ presented: false })
  })

  test("Bearer credential is extracted", () => {
    expect(parseAuthorizationHeader("Bearer secret-token")).toEqual({
      presented: true,
      credential: "secret-token",
    })
  })

  test("Bearer scheme is case-insensitive", () => {
    expect(parseAuthorizationHeader("bearer secret-token")).toEqual({
      presented: true,
      credential: "secret-token",
    })
  })

  test("non-Bearer scheme is invalid presentation", () => {
    expect(parseAuthorizationHeader("Basic abc")).toEqual({
      presented: true,
      invalid: true,
    })
  })

  test("empty Bearer credential is invalid", () => {
    expect(parseAuthorizationHeader("Bearer ")).toEqual({
      presented: true,
      invalid: true,
    })
  })
})

describe("authenticate", () => {
  test("loopback without Bearer is host", () => {
    const result = authenticate({
      authorization: undefined,
      isLoopback: true,
      lookupByCredentialHash: () => undefined,
    })
    expect(formatPrincipal(result.principal)).toBe("host")
    expect(result.credentialPresented).toBe(false)
  })

  test("non-loopback without Bearer is unauthenticated", () => {
    const result = authenticate({
      authorization: undefined,
      isLoopback: false,
      lookupByCredentialHash: () => undefined,
    })
    expect(formatPrincipal(result.principal)).toBe("unauthenticated")
  })

  test("valid active credential yields device principal even on loopback", () => {
    const credential = "devcred_test_secret"
    const credentialHash = hashDeviceCredential(credential)
    const result = authenticate({
      authorization: `Bearer ${credential}`,
      isLoopback: true,
      lookupByCredentialHash: (hash) =>
        hash === credentialHash ? { id: "device_1", revokedAt: null } : undefined,
    })

    expect(formatPrincipal(result.principal)).toBe("device:device_1")
    expect(result.credentialPresented).toBe(true)
  })

  test("bad Bearer on loopback never becomes host", () => {
    const result = authenticate({
      authorization: "Bearer unknown",
      isLoopback: true,
      lookupByCredentialHash: () => undefined,
    })

    expect(formatPrincipal(result.principal)).toBe("unauthenticated")
    expect(result.credentialPresented).toBe(true)
  })

  test("revoked device is unauthenticated", () => {
    const credential = "devcred_revoked"
    const credentialHash = hashDeviceCredential(credential)
    const result = authenticate({
      authorization: `Bearer ${credential}`,
      isLoopback: true,
      lookupByCredentialHash: (hash) =>
        hash === credentialHash
          ? { id: "device_2", revokedAt: "2026-08-01T00:00:00.000Z" }
          : undefined,
    })

    expect(formatPrincipal(result.principal)).toBe("unauthenticated")
  })
})

describe("authorizeActiveFullOperator", () => {
  test("host and device are operators", () => {
    expect(authorizeActiveFullOperator({ kind: "host" })).toBe(true)
    expect(
      authorizeActiveFullOperator({ kind: "device", deviceId: "device_1" }),
    ).toBe(true)
  })

  test("unauthenticated is not an operator", () => {
    expect(authorizeActiveFullOperator({ kind: "unauthenticated" })).toBe(false)
  })
})

describe("isLoopbackRequest", () => {
  test("recognizes IPv4 and IPv6 loopback", () => {
    expect(isLoopbackRequest({ ip: "127.0.0.1" })).toBe(true)
    expect(isLoopbackRequest({ ip: "::1" })).toBe(true)
    expect(isLoopbackRequest({ ip: "::ffff:127.0.0.1" })).toBe(true)
    expect(isLoopbackRequest({ ip: "10.0.0.1" })).toBe(false)
  })
})

describe("isOpenRoute", () => {
  test("status, claim, and test routes are open", () => {
    expect(isOpenRoute({ method: "GET", routerPath: "/v1/status" })).toBe(true)
    expect(
      isOpenRoute({ method: "POST", routerPath: "/v1/pairing-codes/:code/claim" }),
    ).toBe(true)
    expect(isOpenRoute({ method: "POST", routerPath: "/v1/_test/validate" })).toBe(
      true,
    )
  })

  test("operator routes are not open", () => {
    expect(isOpenRoute({ method: "POST", routerPath: "/v1/pairing-codes" })).toBe(
      false,
    )
    expect(isOpenRoute({ method: "GET", routerPath: "/v1/workspaces" })).toBe(false)
    expect(isOpenRoute({ method: "GET", routerPath: "/v1/sessions/stream" })).toBe(false)
  })
})
