import { describe, expect, test } from "bun:test"
import {
  isIpOrCidr,
  RuntimeSettingsSchema,
  RuntimeSettingsViewSchema,
  UpdateRuntimeSettingsBodySchema,
  UpdateRuntimeSettingsResponseSchema,
} from "./runtime-settings"

const validSettings = {
  advertisedUrl: null,
  advertisedUrlEnabled: true,
  trustedProxies: [],
  bindHost: "127.0.0.1",
  bindPort: 3847,
  logLevel: "info",
  logPath: null,
  allowedRoots: [],
} as const

describe("isIpOrCidr", () => {
  test("accepts IPv4 addresses and CIDRs", () => {
    expect(isIpOrCidr("127.0.0.1")).toBe(true)
    expect(isIpOrCidr("10.0.0.0/8")).toBe(true)
    expect(isIpOrCidr("192.168.1.0/24")).toBe(true)
  })

  test("accepts IPv6 addresses and CIDRs", () => {
    expect(isIpOrCidr("::1")).toBe(true)
    expect(isIpOrCidr("2001:db8::/32")).toBe(true)
  })

  test("rejects hostnames and junk", () => {
    expect(isIpOrCidr("example.com")).toBe(false)
    expect(isIpOrCidr("localhost")).toBe(false)
    expect(isIpOrCidr("999.999.999.999")).toBe(false)
    expect(isIpOrCidr("10.0.0.0/99")).toBe(false)
    expect(isIpOrCidr("not-an-ip")).toBe(false)
    expect(isIpOrCidr("[::1]")).toBe(false)
  })
})

describe("RuntimeSettingsSchema", () => {
  test("accepts seeded defaults", () => {
    expect(RuntimeSettingsSchema.parse(validSettings)).toEqual(validSettings)
  })

  test("defaults advertisedUrlEnabled to true when omitted", () => {
    const withoutFlag = {
      advertisedUrl: validSettings.advertisedUrl,
      trustedProxies: validSettings.trustedProxies,
      bindHost: validSettings.bindHost,
      bindPort: validSettings.bindPort,
      logLevel: validSettings.logLevel,
      logPath: validSettings.logPath,
      allowedRoots: validSettings.allowedRoots,
    }
    expect(RuntimeSettingsSchema.parse(withoutFlag).advertisedUrlEnabled).toBe(true)
  })

  test("accepts https advertised URL and proxies", () => {
    const settings = {
      ...validSettings,
      advertisedUrl: "https://agents.example.com",
      trustedProxies: ["10.0.0.0/8", "::1"],
      logLevel: "debug",
      logPath: "/var/log/agent-server.log",
      allowedRoots: ["/home/ops/projects"],
    }

    expect(RuntimeSettingsSchema.parse(settings)).toEqual(settings)
  })

  test("rejects http advertised URL", () => {
    expect(() =>
      RuntimeSettingsSchema.parse({
        ...validSettings,
        advertisedUrl: "http://agents.example.com",
      }),
    ).toThrow()
  })

  test("rejects malformed https advertised URL", () => {
    expect(() =>
      RuntimeSettingsSchema.parse({
        ...validSettings,
        advertisedUrl: "https://[",
      }),
    ).toThrow()
  })

  test("rejects non-loopback bind host", () => {
    expect(() =>
      RuntimeSettingsSchema.parse({
        ...validSettings,
        bindHost: "0.0.0.0",
      }),
    ).toThrow()
  })

  test("rejects hostname trusted proxies", () => {
    expect(() =>
      RuntimeSettingsSchema.parse({
        ...validSettings,
        trustedProxies: ["proxy.example.com"],
      }),
    ).toThrow()
  })
})

describe("UpdateRuntimeSettingsBodySchema", () => {
  test("accepts partial patch", () => {
    expect(
      UpdateRuntimeSettingsBodySchema.parse({ logLevel: "warn" }),
    ).toEqual({ logLevel: "warn" })
  })

  test("accepts advertisedUrlEnabled patch", () => {
    expect(
      UpdateRuntimeSettingsBodySchema.parse({ advertisedUrlEnabled: false }),
    ).toEqual({ advertisedUrlEnabled: false })
  })

  test("accepts empty string to clear advertised URL", () => {
    expect(
      UpdateRuntimeSettingsBodySchema.parse({ advertisedUrl: "" }),
    ).toEqual({ advertisedUrl: "" })
  })

  test("accepts null advertised URL", () => {
    expect(
      UpdateRuntimeSettingsBodySchema.parse({ advertisedUrl: null }),
    ).toEqual({ advertisedUrl: null })
  })

  test("rejects unknown fields", () => {
    expect(() =>
      UpdateRuntimeSettingsBodySchema.parse({ unknown: true }),
    ).toThrow()
  })
})

describe("UpdateRuntimeSettingsResponseSchema", () => {
  test("includes restartRequired and effective values", () => {
    const response = {
      settings: validSettings,
      restartRequired: true,
      effective: {
        bindHost: "127.0.0.1",
        bindPort: 3847,
        logPath: null,
      },
      overrides: {},
    }

    expect(UpdateRuntimeSettingsResponseSchema.parse(response)).toEqual(response)
  })
})

describe("RuntimeSettingsViewSchema", () => {
  test("accepts wrapped runtime settings view", () => {
    const view = {
      settings: validSettings,
      restartRequired: false,
      effective: {
        bindHost: "127.0.0.1",
        bindPort: 3847,
        logPath: null,
      },
      overrides: { bindPort: "env" as const },
    }

    expect(RuntimeSettingsViewSchema.parse(view)).toEqual(view)
  })
})
