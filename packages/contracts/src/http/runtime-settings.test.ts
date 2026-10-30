import { describe, expect, test } from "bun:test"
import {
  AdvertisedUrlSchema,
  RuntimeSettingsSchema,
  RuntimeSettingsViewSchema,
} from "./runtime-settings"

const validSettings = {
  bindPort: 3847,
  logLevel: "info",
  logPath: null,
} as const

describe("RuntimeSettingsSchema", () => {
  test("accepts seeded defaults", () => {
    expect(RuntimeSettingsSchema.parse(validSettings)).toEqual(validSettings)
  })

  test("rejects unknown keys such as the retired trustedProxies", () => {
    expect(() =>
      RuntimeSettingsSchema.parse({
        ...validSettings,
        trustedProxies: ["127.0.0.1"],
      }),
    ).toThrow()
  })

  test("rejects the retired allowedRoots key", () => {
    expect(() =>
      RuntimeSettingsSchema.parse({
        ...validSettings,
        allowedRoots: ["/home/ops/projects"],
      }),
    ).toThrow()
  })

  test("rejects the retired bind host and advertised keys", () => {
    expect(() =>
      RuntimeSettingsSchema.parse({
        ...validSettings,
        bindHost: "0.0.0.0",
        advertisedUrl: "http://192.168.1.10:3847",
        advertisedUrlEnabled: true,
      }),
    ).toThrow()
  })
})

describe("AdvertisedUrlSchema", () => {
  // The schema no longer persists advertised endpoints, but the pair flow
  // still validates user-entered custom URLs with the shared reachability
  // rule: https everywhere, http only on loopback and private-network hosts.
  test("accepts https URLs", () => {
    expect(AdvertisedUrlSchema.safeParse("https://agents.example.com").success).toBe(true)
  })

  test("accepts http URLs on loopback and private-network hosts", () => {
    const urls = [
      "http://127.0.0.1:3847",
      "http://localhost:3847",
      "http://10.0.0.236:3847",
      "http://192.168.1.10:3847",
      "http://100.64.0.9:3847",
      "http://harold.local:3847",
    ]

    for (const url of urls) {
      expect(AdvertisedUrlSchema.safeParse(url).success).toBe(true)
    }
  })

  test("rejects http URLs on public hosts", () => {
    for (const url of ["http://agents.example.com", "http://8.8.8.8:3847"]) {
      expect(AdvertisedUrlSchema.safeParse(url).success).toBe(false)
    }
  })
})

describe("RuntimeSettingsViewSchema", () => {
  test("accepts wrapped runtime settings view with a port-only override", () => {
    const view = {
      settings: validSettings,
      restartRequired: true,
      effective: {
        bindPort: 4123,
        logPath: null,
      },
      overrides: { bindPort: "env" as const },
    }

    expect(RuntimeSettingsViewSchema.parse(view)).toEqual(view)
  })
})
