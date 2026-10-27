import { describe, expect, test } from "bun:test"
import { RuntimeSettings } from "contracts/http/runtime-settings"
import {
  makeUpdateRuntimeSettings,
  UpdateRuntimeSettingsCommand,
} from "./runtime-settings.update.usecase"

const previousSettings: RuntimeSettings = {
  advertisedUrl: "https://agents.example.com",
  advertisedUrlEnabled: true,
  bindHost: "127.0.0.1",
  bindPort: 3847,
  logLevel: "info",
  logPath: null,
}

type DepsOverrides = {
  settings?: RuntimeSettings
  savedSettings?: RuntimeSettings
}

const makeDeps = (overrides: DepsOverrides = {}) => {
  const saved: RuntimeSettings[] = []
  const logLevelChanges: string[] = []
  const deps = {
    getSettings: () => overrides.settings ?? previousSettings,
    saveSettings: (next: RuntimeSettings) => {
      saved.push(next)
      return overrides.savedSettings ?? next
    },
    onLogLevelChanged: (logLevel: string) => {
      logLevelChanges.push(logLevel)
    },
  }

  return { deps, saved, logLevelChanges }
}

const run = async (
  deps: ReturnType<typeof makeDeps>["deps"],
  body: UpdateRuntimeSettingsCommand["body"],
) => makeUpdateRuntimeSettings(deps)({ body })

describe("makeUpdateRuntimeSettings", () => {
  test("merges a partial body over previous settings", async () => {
    const { deps, saved } = makeDeps()

    const result = await run(deps, {
      logLevel: "debug",
      advertisedUrlEnabled: false,
    })

    expect(result).toEqual({
      settings: {
        ...previousSettings,
        logLevel: "debug",
        advertisedUrlEnabled: false,
      },
      logLevelChanged: true,
    })
    expect(saved).toHaveLength(1)
  })

  test("clears advertisedUrl with empty string and logPath with null", async () => {
    const { deps, saved } = makeDeps({
      settings: { ...previousSettings, logPath: "/var/log/harold.log" },
    })

    const result = await run(deps, {
      advertisedUrl: "",
      logPath: null,
    })

    expect(result.settings.advertisedUrl).toBeNull()
    expect(result.settings.logPath).toBeNull()
    expect(saved[0]?.advertisedUrl).toBeNull()
    expect(saved[0]?.logPath).toBeNull()
  })

  test("keeps previous fields when the body omits them", async () => {
    const { deps, saved } = makeDeps()

    const result = await run(deps, { bindPort: 4000 })

    expect(result.settings.bindPort).toBe(4000)
    expect(saved[0]?.bindHost).toBe(previousSettings.bindHost)
    expect(saved[0]?.logLevel).toBe(previousSettings.logLevel)
    expect(saved[0]?.advertisedUrl).toBe(previousSettings.advertisedUrl)
  })

  test("notifies log level change only when logLevel actually changes", async () => {
    const changed = makeDeps()
    await run(changed.deps, { logLevel: "debug" })
    expect(changed.logLevelChanges).toEqual(["debug"])

    const unchanged = makeDeps()
    await run(unchanged.deps, { logLevel: "info" })
    expect(unchanged.logLevelChanges).toEqual([])

    const absent = makeDeps()
    await run(absent.deps, { bindPort: 4000 })
    expect(absent.logLevelChanges).toEqual([])
  })

  test("never touches workspace metadata", async () => {
    const { deps, saved } = makeDeps()

    await run(deps, { logLevel: "warn" })

    expect(Object.keys(saved[0] ?? {}).sort()).toEqual([
      "advertisedUrl",
      "advertisedUrlEnabled",
      "bindHost",
      "bindPort",
      "logLevel",
      "logPath",
    ])
  })
})
