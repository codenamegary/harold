import { describe, expect, test } from "bun:test"
import {
  hasDialableAddress,
  selectLanAddress,
  usableIpv4AddressEntries,
  usableIpv4Addresses,
} from "./lan.address"

const entry = (
  address: string,
  overrides: Partial<{ family: string | number; internal: boolean }> = {},
) => ({
  address,
  family: "IPv4",
  internal: false,
  ...overrides,
})

describe("selectLanAddress", () => {
  test("picks a physical IPv4 address and skips internal, link-local, and virtual interfaces", () => {
    expect(
      selectLanAddress({
        lo: [entry("127.0.0.1", { internal: true })],
        docker0: [entry("172.17.0.1")],
        eth0: [entry("10.0.0.236"), entry("fe80::1", { family: "IPv6" })],
        wlan0: [entry("169.254.10.20")],
      }),
    ).toBe("10.0.0.236")
  })

  test("accepts a numeric IPv4 family value", () => {
    expect(
      selectLanAddress({
        eth0: [entry("192.168.1.20", { family: 4 })],
      }),
    ).toBe("192.168.1.20")
  })

  test("falls back to a virtual interface when no physical interface has an address", () => {
    expect(
      selectLanAddress({
        docker0: [entry("172.17.0.1")],
      }),
    ).toBe("172.17.0.1")
  })

  test("returns null when no usable IPv4 address exists", () => {
    expect(
      selectLanAddress({
        lo: [entry("127.0.0.1", { internal: true })],
        eth0: [entry("fe80::1", { family: "IPv6" })],
      }),
    ).toBeNull()
  })
})

describe("usableIpv4Addresses", () => {
  test("lists every non-internal, non-link-local IPv4 address across interfaces", () => {
    expect(
      usableIpv4Addresses({
        lo: [entry("127.0.0.1", { internal: true })],
        docker0: [entry("172.17.0.1")],
        tailscale0: [entry("100.64.0.9")],
        eth0: [entry("10.0.0.236"), entry("169.254.10.20")],
        eth0v6: [entry("fd00::1", { family: "IPv6" })],
      }),
    ).toEqual(["172.17.0.1", "100.64.0.9", "10.0.0.236"])
  })
})

describe("usableIpv4AddressEntries", () => {
  test("keeps the owning interface name with each usable address", () => {
    expect(
      usableIpv4AddressEntries({
        lo: [entry("127.0.0.1", { internal: true })],
        docker0: [entry("172.17.0.1")],
        eth0: [entry("10.0.0.236"), entry("169.254.10.20")],
      }),
    ).toEqual([
      { name: "docker0", address: "172.17.0.1" },
      { name: "eth0", address: "10.0.0.236" },
    ])
  })
})

describe("hasDialableAddress", () => {
  test("is true when any non-internal, non-link-local IPv4 address exists", () => {
    // The boot gate is deliberately lenient: a Tailscale-only machine is
    // networked and must start, because a tailnet phone can pair with it.
    expect(
      hasDialableAddress({
        lo: [entry("127.0.0.1", { internal: true })],
        tailscale0: [entry("100.64.0.9")],
      }),
    ).toBe(true)
  })

  test("is false on a loopback-only or link-local-only machine", () => {
    expect(
      hasDialableAddress({
        lo: [entry("127.0.0.1", { internal: true })],
      }),
    ).toBe(false)
    expect(hasDialableAddress({ eth0: [entry("169.254.10.20")] })).toBe(false)
  })

  test("is false when there are no interfaces at all", () => {
    expect(hasDialableAddress({})).toBe(false)
  })
})
