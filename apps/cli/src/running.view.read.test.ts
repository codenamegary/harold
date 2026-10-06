import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { parseConfig } from "server/config"
import { readRunningView } from "./running.view"

describe("readRunningView", () => {
  let scratch = ""
  let previousDataDir: string | undefined

  beforeAll(async () => {
    scratch = await mkdtemp(path.join(os.tmpdir(), "harold-running-view-"))
    previousDataDir = process.env.HAROLD_DATA_DIR
    process.env.HAROLD_DATA_DIR = scratch
  })

  afterAll(async () => {
    if (previousDataDir === undefined) {
      delete process.env.HAROLD_DATA_DIR
    } else {
      process.env.HAROLD_DATA_DIR = previousDataDir
    }
    await rm(scratch, { recursive: true, force: true })
  })

  test("reads the summary and device count from a fresh data dir", () => {
    const view = readRunningView(parseConfig(process.env))

    expect(view.summary.dataDir).toBe(scratch)
    expect(view.summary.localApi).toEqual({ host: "127.0.0.1", port: 3847 })
    expect(view.summary.workspaces).toBe(0)
    expect(view.devices).toBe(0)
  })
})
