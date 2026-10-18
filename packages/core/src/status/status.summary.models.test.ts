import { describe, expect, test } from "bun:test"
import { localApiUrl } from "./status.summary.models"

describe("localApiUrl", () => {
  test("uses loopback for a loopback bind", () => {
    expect(localApiUrl({ host: "127.0.0.1", port: 3847 })).toBe("http://127.0.0.1:3847")
  })

  test("uses loopback for a wildcard IPv4 bind", () => {
    expect(localApiUrl({ host: "0.0.0.0", port: 3847 })).toBe("http://127.0.0.1:3847")
  })

  test("uses IPv6 loopback for a wildcard IPv6 bind", () => {
    expect(localApiUrl({ host: "::", port: 3847 })).toBe("http://[::1]:3847")
  })

  test("uses the bound address for a specific interface", () => {
    expect(localApiUrl({ host: "10.0.0.236", port: 3847 })).toBe("http://10.0.0.236:3847")
    expect(localApiUrl({ host: "fd00::1", port: 3847 })).toBe("http://[fd00::1]:3847")
  })
})
