import { describe, expect, test } from "bun:test"
import { isHostPrincipalRequest, isTrustedProxyPeer } from "./request.origin"

describe("isTrustedProxyPeer", () => {
  test("matches exact IPv4 and CIDR entries", () => {
    expect(isTrustedProxyPeer("127.0.0.1", ["127.0.0.1"])).toBe(true)
    expect(isTrustedProxyPeer("127.0.0.1", ["127.0.0.0/8"])).toBe(true)
    expect(isTrustedProxyPeer("10.0.0.5", ["127.0.0.0/8"])).toBe(false)
  })

  test("empty allowlist never matches", () => {
    expect(isTrustedProxyPeer("127.0.0.1", [])).toBe(false)
  })
})

describe("isHostPrincipalRequest", () => {
  test("direct loopback outside trustedProxies stays host-eligible", () => {
    expect(isHostPrincipalRequest({ ip: "127.0.0.1" }, [])).toBe(true)
    expect(isHostPrincipalRequest({ ip: "127.0.0.1" }, ["10.0.0.1"])).toBe(true)
  })

  test("trusted proxy peer is not host-eligible", () => {
    expect(isHostPrincipalRequest({ ip: "127.0.0.1" }, ["127.0.0.1"])).toBe(
      false,
    )
  })

  test("non-loopback is never host-eligible", () => {
    expect(
      isHostPrincipalRequest({ ip: "10.0.0.1" }, ["10.0.0.0/8"]),
    ).toBe(false)
  })
})
