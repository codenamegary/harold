import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import YAML from "yaml"
import {
  advertisedEndpointsFileName,
  makeAdvertisedEndpointsFileStore,
} from "./advertised.endpoints.file.adapters"

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "harold-advertised-endpoints-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("makeAdvertisedEndpointsFileStore", () => {
  test("reads an empty history when the file is missing", async () => {
    const dataDir = await createTempDataDir()
    const store = makeAdvertisedEndpointsFileStore({ dataDir })

    expect(store.read()).toEqual([])
  })

  test("records an endpoint to disk in most-recently-used order", async () => {
    const dataDir = await createTempDataDir()
    const store = makeAdvertisedEndpointsFileStore({ dataDir })

    store.record({
      url: "http://10.0.0.5:3847",
      source: "detected",
      lastUsedAt: "2026-10-01T00:00:00.000Z",
    })
    store.record({
      url: "http://192.168.1.20:3847",
      source: "manual",
      lastUsedAt: "2026-10-02T00:00:00.000Z",
    })

    expect(store.read().map((item) => item.url)).toEqual([
      "http://192.168.1.20:3847",
      "http://10.0.0.5:3847",
    ])

    const parsed = YAML.parse(
      await readFile(path.join(dataDir, advertisedEndpointsFileName), "utf8"),
    )
    expect(parsed.endpoints[0]?.url).toBe("http://192.168.1.20:3847")
  })

  test("ignores a corrupt history file by starting fresh", async () => {
    const dataDir = await createTempDataDir()
    const { writeFileSync } = await import("node:fs")
    writeFileSync(path.join(dataDir, advertisedEndpointsFileName), "not: [valid\n", "utf8")

    const store = makeAdvertisedEndpointsFileStore({ dataDir })

    expect(store.read()).toEqual([])
  })
})
