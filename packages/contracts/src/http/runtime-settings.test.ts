import { describe, expect, test } from "bun:test"
import {
  RuntimeSettingsSchema,
  RuntimeSettingsViewSchema,
  UpdateRuntimeSettingsBodySchema,
  UpdateRuntimeSettingsResponseSchema,
} from "./runtime-settings"

const validSettings = {
  advertisedUrl: null,
  advertisedUrlEnabled: true,
  bindHost: "127.0.0.1",
  bindPort: 3847,
  logLevel: "info",
  logPath: null,
  allowedRoots: [],
} as const

describe("RuntimeSettingsSchema", () => {
  test("accepts loopback http advertised URL", () => {
    const settings = {
      ...validSettings,
      advertisedUrl: "http://127.0.0.1:3847",
    }

    expect(RuntimeSettingsSchema.parse(settings)).toEqual(settings)
  })

  test("accepts http advertised URL on localhost and IPv6 loopback", () => {
    expect(
      RuntimeSettingsSchema.safeParse({
        ...validSettings,
        advertisedUrl: "http://localhost:3847",
      }).success,
    ).toBe(true)
    expect(
      RuntimeSettingsSchema.safeParse({
        ...validSettings,
        advertisedUrl: "http://[::1]:3847",
      }).success,
    ).toBe(true)
  })

  test("accepts seeded defaults", () => {
    expect(RuntimeSettingsSchema.parse(validSettings)).toEqual(validSettings)
  })

  test("defaults advertisedUrlEnabled to true when omitted", () => {
    const withoutFlag = {
      advertisedUrl: validSettings.advertisedUrl,
      bindHost: validSettings.bindHost,
      bindPort: validSettings.bindPort,
      logLevel: validSettings.logLevel,
      logPath: validSettings.logPath,
      allowedRoots: validSettings.allowedRoots,
    }
    expect(RuntimeSettingsSchema.parse(withoutFlag).advertisedUrlEnabled).toBe(true)
  })

  test("accepts https advertised URL", () => {
    const settings = {
      ...validSettings,
      advertisedUrl: "https://agents.example.com",
      logLevel: "debug",
      logPath: "/var/log/harold.log",
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

  test("rejects http advertised URL on a non-loopback local address", () => {
    expect(
      RuntimeSettingsSchema.safeParse({
        ...validSettings,
        advertisedUrl: "http://192.168.1.10:3847",
      }).success,
    ).toBe(false)
  })

  test("rejects malformed loopback http advertised URL", () => {
    expect(
      RuntimeSettingsSchema.safeParse({
        ...validSettings,
        advertisedUrl: "http://127.0.0.1:notaport",
      }).success,
    ).toBe(false)
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

  test("rejects unknown keys such as the retired trustedProxies", () => {
    expect(() =>
      RuntimeSettingsSchema.parse({
        ...validSettings,
        trustedProxies: ["127.0.0.1"],
      }),
    ).toThrow()
  })
})

describe("UpdateRuntimeSettingsBodySchema", () => {
  test("accepts partial patch", () => {
    expect(UpdateRuntimeSettingsBodySchema.parse({ logLevel: "warn" })).toEqual({
      logLevel: "warn",
    })
  })

  test("accepts advertisedUrlEnabled patch", () => {
    expect(UpdateRuntimeSettingsBodySchema.parse({ advertisedUrlEnabled: false })).toEqual({
      advertisedUrlEnabled: false,
    })
  })

  test("accepts empty string to clear advertised URL", () => {
    expect(UpdateRuntimeSettingsBodySchema.parse({ advertisedUrl: "" })).toEqual({
      advertisedUrl: "",
    })
  })

  test("accepts null advertised URL", () => {
    expect(UpdateRuntimeSettingsBodySchema.parse({ advertisedUrl: null })).toEqual({
      advertisedUrl: null,
    })
  })

  test("accepts loopback http advertised URL patch", () => {
    expect(
      UpdateRuntimeSettingsBodySchema.parse({ advertisedUrl: "http://localhost:3847" }),
    ).toEqual({
      advertisedUrl: "http://localhost:3847",
    })
  })

  test("rejects non-loopback http advertised URL patch", () => {
    expect(
      UpdateRuntimeSettingsBodySchema.safeParse({
        advertisedUrl: "http://agents.example.com",
      }).success,
    ).toBe(false)
  })

  test("rejects unknown fields", () => {
    expect(() => UpdateRuntimeSettingsBodySchema.parse({ unknown: true })).toThrow()
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
