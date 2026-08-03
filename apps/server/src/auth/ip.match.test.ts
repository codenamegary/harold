import { describe, expect, test } from "bun:test"
import { ipMatchesAllowlist, ipMatchesEntry, parseIp } from "./ip.match"

describe("parseIp", () => {
  test("parses IPv4 and IPv4-mapped loopback", () => {
    expect(parseIp("127.0.0.1")?.kind).toBe("ipv4")
    expect(parseIp("::ffff:127.0.0.1")?.kind).toBe("ipv4")
  })

  test("parses IPv6 loopback", () => {
    expect(parseIp("::1")?.kind).toBe("ipv6")
  })
})

describe("ipMatchesEntry", () => {
  test("matches exact IPv4", () => {
    const peer = parseIp("127.0.0.1")
    expect(peer).toBeDefined()
    if (peer === undefined) {
      return
    }

    expect(ipMatchesEntry(peer, "127.0.0.1")).toBe(true)
    expect(ipMatchesEntry(peer, "10.0.0.1")).toBe(false)
  })

  test("matches IPv4 CIDR", () => {
    const peer = parseIp("127.0.0.5")
    expect(peer).toBeDefined()
    if (peer === undefined) {
      return
    }

    expect(ipMatchesEntry(peer, "127.0.0.0/8")).toBe(true)
    expect(ipMatchesEntry(peer, "10.0.0.0/8")).toBe(false)
  })

  test("matches IPv6 CIDR", () => {
    const peer = parseIp("2001:db8::1")
    expect(peer).toBeDefined()
    if (peer === undefined) {
      return
    }

    expect(ipMatchesEntry(peer, "2001:db8::/32")).toBe(true)
    expect(ipMatchesEntry(peer, "2001:db8:1::/48")).toBe(false)
  })
})

describe("ipMatchesAllowlist", () => {
  test("returns false for empty allowlist", () => {
    expect(ipMatchesAllowlist("127.0.0.1", [])).toBe(false)
  })

  test("matches any allowlist entry", () => {
    expect(ipMatchesAllowlist("127.0.0.1", ["10.0.0.0/8", "127.0.0.1"])).toBe(true)
  })
})
