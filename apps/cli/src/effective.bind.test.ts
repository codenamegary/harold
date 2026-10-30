import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import YAML from "yaml"
import { parseConfig } from "server/config"
import { effectiveBindPort } from "./effective.bind"

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "harold-effective-bind-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("effectiveBindPort", () => {
  test("reads the persisted bindPort when the environment is silent", async () => {
    const dataDir = await createTempDataDir()
    await writeFile(
      path.join(dataDir, "settings.yml"),
      YAML.stringify({ bindPort: 3949, logLevel: "info", logPath: null }),
      "utf8",
    )

    const port = effectiveBindPort(parseConfig({ HAROLD_DATA_DIR: dataDir }), {})

    expect(port).toBe(3949)
  })

  test("HAROLD_PORT overrides the persisted bindPort", async () => {
    const dataDir = await createTempDataDir()
    await writeFile(
      path.join(dataDir, "settings.yml"),
      YAML.stringify({ bindPort: 3949, logLevel: "info", logPath: null }),
      "utf8",
    )

    const port = effectiveBindPort(parseConfig({ HAROLD_DATA_DIR: dataDir }), {
      HAROLD_PORT: "5000",
    })

    expect(port).toBe(5000)
  })

  test("falls back to the default port on a fresh data dir", async () => {
    const dataDir = await createTempDataDir()

    const port = effectiveBindPort(parseConfig({ HAROLD_DATA_DIR: dataDir }), {})

    expect(port).toBe(3847)
  })
})
