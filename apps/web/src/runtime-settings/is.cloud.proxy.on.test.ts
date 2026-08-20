import { describe, expect, test } from "bun:test"
import { RuntimeSettings } from "contracts/http/runtime-settings"
import { isCloudProxyOn } from "./is.cloud.proxy.on"

const settings = {
  advertisedUrl: null,
  advertisedUrlEnabled: true,
  trustedProxies: [],
  bindHost: "127.0.0.1",
  bindPort: 3847,
  logLevel: "info",
  logPath: null,
  allowedRoots: [],
} satisfies RuntimeSettings

describe("isCloudProxyOn", () => {
  test("is off when no advertised URL", () => {
    expect(isCloudProxyOn(settings)).toBe(false)
  })

  test("is on when URL is saved and enabled", () => {
    expect(
      isCloudProxyOn({
        ...settings,
        advertisedUrl: "https://agents.example.com",
        advertisedUrlEnabled: true,
      }),
    ).toBe(true)
  })

  test("is off when URL is saved and disabled", () => {
    expect(
      isCloudProxyOn({
        ...settings,
        advertisedUrl: "https://agents.example.com",
        advertisedUrlEnabled: false,
      }),
    ).toBe(false)
  })
})
