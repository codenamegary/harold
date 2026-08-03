import { describe, expect, test } from "bun:test"
import {
  hasHonoredForwardedHeaders,
  isHostPrincipalRequest,
  isTrustedProxyPeer,
} from "./request.origin"

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

describe("hasHonoredForwardedHeaders", () => {
  test("ignores headers from untrusted peers", () => {
    expect(
      hasHonoredForwardedHeaders(
        { headers: { "x-forwarded-for": "203.0.113.5" } },
        false,
      ),
    ).toBe(false)
  })

  test("detects forwarded header families from trusted peers", () => {
    expect(
      hasHonoredForwardedHeaders(
        { headers: { "x-forwarded-for": "203.0.113.5" } },
        true,
      ),
    ).toBe(true)
    expect(
      hasHonoredForwardedHeaders(
        { headers: { "x-forwarded-proto": "https" } },
        true,
      ),
    ).toBe(true)
    expect(
      hasHonoredForwardedHeaders({ headers: { "x-real-ip": "203.0.113.5" } }, true),
    ).toBe(true)
    expect(
      hasHonoredForwardedHeaders(
        { headers: { forwarded: "for=203.0.113.5;proto=https" } },
        true,
      ),
    ).toBe(true)
  })
})

describe("isHostPrincipalRequest", () => {
  test("direct loopback without headers stays host-eligible", () => {
    expect(
      isHostPrincipalRequest({ ip: "127.0.0.1", headers: {} }, ["127.0.0.1"]),
    ).toBe(true)
  })

  test("spoofed headers from untrusted loopback stay host-eligible", () => {
    expect(
      isHostPrincipalRequest(
        { ip: "127.0.0.1", headers: { "x-forwarded-for": "203.0.113.5" } },
        ["10.0.0.1"],
      ),
    ).toBe(true)
  })

  test("trusted proxy with forwarded headers is not host-eligible", () => {
    expect(
      isHostPrincipalRequest(
        { ip: "127.0.0.1", headers: { "x-forwarded-for": "203.0.113.5" } },
        ["127.0.0.1"],
      ),
    ).toBe(false)
  })

  test("non-loopback is never host-eligible", () => {
    expect(
      isHostPrincipalRequest({ ip: "10.0.0.1", headers: {} }, ["10.0.0.0/8"]),
    ).toBe(false)
  })
})
