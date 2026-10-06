import { describe, expect, test } from "bun:test"
import { hashDeviceCredential } from "core/device/hash.credential"
import { authenticate } from "./authenticate"
import { authorizeActiveDevice } from "./authorize"
import { parseAuthorizationHeader } from "./bearer"
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
  test("without Bearer is unauthenticated, even on loopback", () => {
    const result = authenticate({
      authorization: undefined,
      lookupByCredentialHash: () => undefined,
    })
    expect(formatPrincipal(result.principal)).toBe("unauthenticated")
    expect(result.credentialPresented).toBe(false)
  })

  test("valid active credential yields device principal", () => {
    const credential = "devcred_test_secret"
    const credentialHash = hashDeviceCredential(credential)
    const result = authenticate({
      authorization: `Bearer ${credential}`,
      lookupByCredentialHash: (hash) =>
        hash === credentialHash ? { id: "device_1", revokedAt: null } : undefined,
    })

    expect(formatPrincipal(result.principal)).toBe("device:device_1")
    expect(result.credentialPresented).toBe(true)
  })

  test("bad Bearer never authenticates", () => {
    const result = authenticate({
      authorization: "Bearer unknown",
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
      lookupByCredentialHash: (hash) =>
        hash === credentialHash
          ? { id: "device_2", revokedAt: "2026-08-01T00:00:00.000Z" }
          : undefined,
    })

    expect(formatPrincipal(result.principal)).toBe("unauthenticated")
  })
})

describe("authorizeActiveDevice", () => {
  test("device is authorized", () => {
    expect(authorizeActiveDevice({ kind: "device", deviceId: "device_1" })).toBe(true)
  })

  test("unauthenticated is not authorized", () => {
    expect(authorizeActiveDevice({ kind: "unauthenticated" })).toBe(false)
  })
})

describe("isOpenRoute", () => {
  test("status, claim, and test routes are open", () => {
    expect(isOpenRoute({ method: "GET", routerPath: "/v1/status" })).toBe(true)
    expect(isOpenRoute({ method: "POST", routerPath: "/v1/pairing-codes/:code/claim" })).toBe(true)
    expect(isOpenRoute({ method: "POST", routerPath: "/v1/_test/validate" })).toBe(true)
  })

  test("operator routes are not open", () => {
    expect(isOpenRoute({ method: "POST", routerPath: "/v1/pairing-codes" })).toBe(false)
    expect(isOpenRoute({ method: "GET", routerPath: "/v1/workspaces" })).toBe(false)
    expect(isOpenRoute({ method: "GET", routerPath: "/v1/sessions/stream" })).toBe(false)
  })
})
