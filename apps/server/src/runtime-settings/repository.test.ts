import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import YAML from "yaml"
import {
  createRuntimeSettingsRepository,
  settingsFileName,
} from "./repository"

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(
    path.join(os.tmpdir(), "agent-server-runtime-settings-repo-"),
  )
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

describe("createRuntimeSettingsRepository", () => {
  test("seeds settings.yml from defaults when missing", async () => {
    const dataDir = await createTempDataDir()
    const repository = createRuntimeSettingsRepository({ dataDir })

    expect(repository.get()).toEqual({
      advertisedUrl: null,
      trustedProxies: [],
      bindHost: "127.0.0.1",
      bindPort: 3847,
      logLevel: "info",
      logPath: null,
      allowedRoots: [],
    })

    const filePath = path.join(dataDir, settingsFileName)
    const parsed = YAML.parse(await readFile(filePath, "utf8"))
    expect(parsed).toEqual(repository.get())
  })

  test("refuses to load corrupt YAML", async () => {
    const dataDir = await createTempDataDir()
    const filePath = path.join(dataDir, settingsFileName)
    await writeFile(filePath, "bindPort: [\n", "utf8")

    expect(() => createRuntimeSettingsRepository({ dataDir })).toThrow(
      /Invalid settings\.yml/,
    )
  })

  test("refuses to load invalid schema", async () => {
    const dataDir = await createTempDataDir()
    const filePath = path.join(dataDir, settingsFileName)
    await writeFile(
      filePath,
      YAML.stringify({
        advertisedUrl: null,
        trustedProxies: [],
        bindHost: "0.0.0.0",
        bindPort: 3847,
        logLevel: "info",
        logPath: null,
        allowedRoots: [],
      }),
      "utf8",
    )

    expect(() => createRuntimeSettingsRepository({ dataDir })).toThrow(
      /Invalid settings\.yml/,
    )
  })

  test("ignores hand edits until a new repository loads", async () => {
    const dataDir = await createTempDataDir()
    const repository = createRuntimeSettingsRepository({ dataDir })
    const filePath = path.join(dataDir, settingsFileName)

    await writeFile(
      filePath,
      YAML.stringify({
        ...repository.get(),
        logLevel: "debug",
      }),
      "utf8",
    )

    expect(repository.get().logLevel).toBe("info")

    const reloaded = createRuntimeSettingsRepository({ dataDir })
    expect(reloaded.get().logLevel).toBe("debug")
  })

  test("update writes settings.yml and keeps cache in sync", async () => {
    const dataDir = await createTempDataDir()
    const repository = createRuntimeSettingsRepository({ dataDir })

    const result = repository.update({
      advertisedUrl: "https://agents.example.com",
      logLevel: "warn",
    })

    expect(result.logLevel).toBe("warn")
    expect(repository.get().logLevel).toBe("warn")

    const parsed = YAML.parse(
      await readFile(path.join(dataDir, settingsFileName), "utf8"),
    )
    expect(parsed).toEqual(result)
  })
})
