import { describe, expect, test } from "bun:test"
import { selectLanAddress } from "./lan.address"

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
