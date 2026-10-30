import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import YAML from "yaml"
import { makeRuntimeSettingsFileStore, settingsFileName } from "./runtime-settings.file.adapters"

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "harold-runtime-settings-store-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("makeRuntimeSettingsFileStore", () => {
  test("seeds settings.yml from defaults when missing", async () => {
    const dataDir = await createTempDataDir()
    const store = makeRuntimeSettingsFileStore({ dataDir })

    expect(store.get()).toEqual({
      bindPort: 3847,
      logLevel: "info",
      logPath: null,
    })

    const filePath = path.join(dataDir, settingsFileName)
    const parsed = YAML.parse(await readFile(filePath, "utf8"))
    expect(parsed).toEqual(store.get())
  })

  test("seeds settings.yml from provided seed defaults", async () => {
    const dataDir = await createTempDataDir()
    const store = makeRuntimeSettingsFileStore({
      dataDir,
      seedDefaults: {
        bindPort: 4123,
        logLevel: "info",
        logPath: null,
      },
    })

    expect(store.get().bindPort).toBe(4123)
    const fileRaw = await readFile(path.join(dataDir, settingsFileName), "utf8")
    expect(fileRaw).toContain("bindPort: 4123")
  })

  test("refuses to load corrupt YAML", async () => {
    const dataDir = await createTempDataDir()
    const filePath = path.join(dataDir, settingsFileName)
    await writeFile(filePath, "bindPort: [\n", "utf8")

    expect(() => makeRuntimeSettingsFileStore({ dataDir })).toThrow(/Invalid settings\.yml/)
  })

  test("strips retired bind and advertised keys when loading legacy settings.yml", async () => {
    const dataDir = await createTempDataDir()
    const filePath = path.join(dataDir, settingsFileName)
    await writeFile(
      filePath,
      YAML.stringify({
        advertisedUrl: "http://10.0.0.236:3847",
        advertisedUrlEnabled: true,
        bindHost: "0.0.0.0",
        bindPort: 3847,
        logLevel: "info",
        logPath: null,
      }),
      "utf8",
    )

    const store = makeRuntimeSettingsFileStore({ dataDir })

    expect(store.get()).toEqual({
      bindPort: 3847,
      logLevel: "info",
      logPath: null,
    })
  })

  test("refuses to load invalid schema", async () => {
    const dataDir = await createTempDataDir()
    const filePath = path.join(dataDir, settingsFileName)
    await writeFile(
      filePath,
      YAML.stringify({
        bindPort: "not-a-port",
        logLevel: "info",
        logPath: null,
      }),
      "utf8",
    )

    expect(() => makeRuntimeSettingsFileStore({ dataDir })).toThrow(/Invalid settings\.yml/)
  })

  test("refuses to load a settings.yml that still contains allowedRoots", async () => {
    const dataDir = await createTempDataDir()
    const filePath = path.join(dataDir, settingsFileName)
    await writeFile(
      filePath,
      YAML.stringify({
        bindPort: 3847,
        logLevel: "info",
        logPath: null,
        allowedRoots: ["/home/ops/projects"],
      }),
      "utf8",
    )

    expect(() => makeRuntimeSettingsFileStore({ dataDir })).toThrow(/Invalid settings\.yml/)
  })

  test("ignores the retired trustedProxies key when loading legacy settings.yml", async () => {
    const dataDir = await createTempDataDir()
    const filePath = path.join(dataDir, settingsFileName)
    await writeFile(
      filePath,
      YAML.stringify({
        trustedProxies: ["127.0.0.1"],
        bindPort: 3847,
        logLevel: "info",
        logPath: null,
      }),
      "utf8",
    )

    const store = makeRuntimeSettingsFileStore({ dataDir })
    const settings = store.get()
    expect("trustedProxies" in settings).toBe(false)
    expect(settings.bindPort).toBe(3847)
  })

  test("ignores hand edits until a new store loads", async () => {
    const dataDir = await createTempDataDir()
    const store = makeRuntimeSettingsFileStore({ dataDir })
    const filePath = path.join(dataDir, settingsFileName)

    await writeFile(
      filePath,
      YAML.stringify({
        ...store.get(),
        logLevel: "debug",
      }),
      "utf8",
    )

    expect(store.get().logLevel).toBe("info")

    const reloaded = makeRuntimeSettingsFileStore({ dataDir })
    expect(reloaded.get().logLevel).toBe("debug")
  })

  test("save persists the full settings document and keeps the cache in sync", async () => {
    const dataDir = await createTempDataDir()
    const store = makeRuntimeSettingsFileStore({ dataDir })

    const withLevel = store.save({
      ...store.get(),
      logLevel: "warn",
    })

    expect(withLevel.logLevel).toBe("warn")
    expect(store.get().logLevel).toBe("warn")

    const parsed = YAML.parse(await readFile(path.join(dataDir, settingsFileName), "utf8"))
    expect(parsed).toEqual(withLevel)
  })
})
