import { describe, expect, test } from "bun:test"
import {
  buildAppliedRuntimeSettings,
  buildRuntimeSettingsView,
  computeRestartRequired,
  resolveEffectiveBindOverrides,
  resolveEffectiveBindPort,
} from "./resolve.runtime.settings.state"

const persisted = {
  bindPort: 3847,
  logLevel: "info" as const,
  logPath: null,
}

describe("resolveEffectiveBindPort", () => {
  test("uses persisted port when env is unset", () => {
    expect(resolveEffectiveBindPort({ persisted, envOverrides: {} })).toBe(3847)
  })

  test("prefers env port over persisted", () => {
    expect(resolveEffectiveBindPort({ persisted, envOverrides: { bindPort: 4123 } })).toBe(4123)
  })
})

describe("resolveEffectiveBindOverrides", () => {
  test("marks the port as env-overridden", () => {
    expect(resolveEffectiveBindOverrides({ bindPort: 4123 })).toEqual({
      overrides: { bindPort: "env" },
    })
  })

  test("reports no overrides when env is unset", () => {
    expect(resolveEffectiveBindOverrides({})).toEqual({ overrides: {} })
  })
})

describe("computeRestartRequired", () => {
  test("is false when persisted matches applied", () => {
    expect(
      computeRestartRequired({
        persisted,
        applied: {
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

    expect(applied).toEqual({
      bindPort: 4123,
      logPath: null,
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
        bindPort: 4123,
        logPath: null,
      },
      overrides: { bindPort: "env" },
    })
  })
})
