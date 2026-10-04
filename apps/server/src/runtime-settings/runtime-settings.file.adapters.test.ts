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
      advertisedUrl: null,
      advertisedUrlEnabled: true,
      trustedProxies: [],
      bindHost: "127.0.0.1",
      bindPort: 3847,
      logLevel: "info",
      logPath: null,
      allowedRoots: [],
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
        advertisedUrl: null,
        advertisedUrlEnabled: true,
        trustedProxies: [],
        bindHost: "127.0.0.1",
        bindPort: 4123,
        logLevel: "info",
        logPath: null,
        allowedRoots: [],
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

  test("refuses to load invalid schema", async () => {
    const dataDir = await createTempDataDir()
    const filePath = path.join(dataDir, settingsFileName)
    await writeFile(
      filePath,
      YAML.stringify({
        advertisedUrl: null,
        advertisedUrlEnabled: true,
        trustedProxies: [],
        bindHost: "0.0.0.0",
        bindPort: 3847,
        logLevel: "info",
        logPath: null,
        allowedRoots: [],
      }),
      "utf8",
    )

    expect(() => makeRuntimeSettingsFileStore({ dataDir })).toThrow(/Invalid settings\.yml/)
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

  test("defaults advertisedUrlEnabled when the file omits it", async () => {
    const dataDir = await createTempDataDir()
    const filePath = path.join(dataDir, settingsFileName)
    await writeFile(
      filePath,
      YAML.stringify({
        advertisedUrl: "https://agents.example.com",
        trustedProxies: [],
        bindHost: "127.0.0.1",
        bindPort: 3847,
        logLevel: "info",
        logPath: null,
        allowedRoots: [],
      }),
      "utf8",
    )

    const store = makeRuntimeSettingsFileStore({ dataDir })
    expect(store.get().advertisedUrl).toBe("https://agents.example.com")
    expect(store.get().advertisedUrlEnabled).toBe(true)
  })

  test("save persists the full settings document and keeps the cache in sync", async () => {
    const dataDir = await createTempDataDir()
    const store = makeRuntimeSettingsFileStore({ dataDir })

    const withUrl = store.save({
      ...store.get(),
      advertisedUrl: "https://agents.example.com",
      logLevel: "warn",
    })

    expect(withUrl.logLevel).toBe("warn")
    expect(store.get().logLevel).toBe("warn")

    const parsed = YAML.parse(await readFile(path.join(dataDir, settingsFileName), "utf8"))
    expect(parsed).toEqual(withUrl)
  })

  test("save keeps advertisedUrl when only advertisedUrlEnabled changes", async () => {
    const dataDir = await createTempDataDir()
    const store = makeRuntimeSettingsFileStore({ dataDir })
    store.save({ ...store.get(), advertisedUrl: "https://agents.example.com" })

    const result = store.save({
      ...store.get(),
      advertisedUrlEnabled: false,
    })

    expect(result.advertisedUrl).toBe("https://agents.example.com")
    expect(result.advertisedUrlEnabled).toBe(false)
  })
})
