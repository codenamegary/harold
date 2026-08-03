import { describe, expect, test } from "bun:test"
import {
  buildAppliedRuntimeSettings,
  buildRuntimeSettingsView,
  computeRestartRequired,
  resolveEffectiveBind,
} from "./resolve.runtime.settings.state"

const persisted = {
  advertisedUrl: null,
  trustedProxies: [],
  bindHost: "127.0.0.1" as const,
  bindPort: 3847,
  logLevel: "info" as const,
  logPath: null,
  allowedRoots: [],
}

describe("resolveEffectiveBind", () => {
  test("uses persisted bind when env is unset", () => {
    expect(
      resolveEffectiveBind({
        persisted,
        envOverrides: {},
      }),
    ).toEqual({
      bindHost: "127.0.0.1",
      bindPort: 3847,
      overrides: {},
    })
  })

  test("prefers env port over persisted", () => {
    expect(
      resolveEffectiveBind({
        persisted,
        envOverrides: { bindPort: 4123 },
      }),
    ).toEqual({
      bindHost: "127.0.0.1",
      bindPort: 4123,
      overrides: { bindPort: "env" },
    })
  })
})

describe("computeRestartRequired", () => {
  test("is false when persisted matches applied", () => {
    expect(
      computeRestartRequired({
        persisted,
        applied: {
          bindHost: "127.0.0.1",
          bindPort: 3847,
          logPath: null,
        },
      }),
    ).toBe(false)
  })

  test("is true when bind port differs", () => {
    expect(
      computeRestartRequired({
        persisted: { ...persisted, bindPort: 4000 },
        applied: {
          bindHost: "127.0.0.1",
          bindPort: 3847,
          logPath: null,
        },
      }),
    ).toBe(true)
  })
})

describe("buildRuntimeSettingsView", () => {
  test("includes effective values and env overrides", () => {
    const applied = buildAppliedRuntimeSettings({
      persisted,
      envOverrides: { bindPort: 4123 },
    })

    expect(
      buildRuntimeSettingsView({
        persisted,
        applied,
        envOverrides: { bindPort: 4123 },
      }),
    ).toEqual({
      settings: persisted,
      restartRequired: true,
      effective: {
        bindHost: "127.0.0.1",
        bindPort: 4123,
        logPath: null,
      },
      overrides: { bindPort: "env" },
    })
  })
})
