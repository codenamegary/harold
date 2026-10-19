import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, test } from "bun:test"
import { createConfigOptionsFileCache } from "./config.cache.file"

const config = [
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select" as const,
    currentValue: "m1",
    options: [{ value: "m1", name: "M1" }],
  },
]

const directories: string[] = []

const cachePath = (): string => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "harold-config-cache-"))
  directories.push(directory)
  return path.join(directory, "session-config-cache.json")
}

afterEach(() => {
  for (const directory of directories.splice(0, directories.length)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe("config options file cache", () => {
  test("restores the snapshot after a restart", () => {
    const filePath = cachePath()
    const first = createConfigOptionsFileCache(filePath)
    expect(first.initial).toEqual({})

    first.onChange({ "cursor:s1": config })

    const second = createConfigOptionsFileCache(filePath)
    expect(second.initial).toEqual({ "cursor:s1": config })
  })

  test("starts empty for a corrupt or unknown cache file", () => {
    const corruptPath = cachePath()
    writeFileSync(corruptPath, "not json", "utf8")
    expect(createConfigOptionsFileCache(corruptPath).initial).toEqual({})

    const unknownPath = cachePath()
    writeFileSync(unknownPath, JSON.stringify({ version: 99, sessions: {} }), "utf8")
    expect(createConfigOptionsFileCache(unknownPath).initial).toEqual({})
  })
})
