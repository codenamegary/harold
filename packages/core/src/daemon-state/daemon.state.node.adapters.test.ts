import { describe, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { DaemonStateSchema } from "./daemon.state.models"
import {
  daemonStateFilePath,
  makeDaemonStateFileStore,
  makeNodeRequestStop,
} from "./daemon.state.node.adapters"

const makeState = (overrides: Partial<{ pid: number }> = {}) =>
  DaemonStateSchema.parse({
    pid: 4321,
    writtenAt: "2026-01-01T00:00:00.000Z",
    status: {
      version: "0.2.1",
      state: "online",
      bindAddress: "127.0.0.1",
      port: 3847,
      startedAt: "2026-01-01T00:00:00.000Z",
      acp: { state: "ready", activeSessions: 1 },
    },
    ...overrides,
  })

const makeDataDir = (): string => mkdtempSync(path.join(tmpdir(), "harold-daemon-state-"))

describe("daemon state file store", () => {
  test("writes state and reads it back", () => {
    const dataDir = makeDataDir()
    const store = makeDaemonStateFileStore({ path: daemonStateFilePath(dataDir) })
    const state = makeState({ pid: 4321 })

    store.write(state)

    expect(store.read()).toEqual({ ok: true, state })
    rmSync(dataDir, { recursive: true, force: true })
  })

  test("reports not_found when no state file exists", () => {
    const dataDir = makeDataDir()
    const store = makeDaemonStateFileStore({ path: daemonStateFilePath(dataDir) })

    expect(store.read()).toEqual({ ok: false, error: { kind: "not_found" } })
    rmSync(dataDir, { recursive: true, force: true })
  })

  test("reports invalid when the file is not daemon state", () => {
    const dataDir = makeDataDir()
    const statePath = daemonStateFilePath(dataDir)
    const store = makeDaemonStateFileStore({ path: statePath })
    store.write(makeState())
    writeFileSync(statePath, "not daemon state")

    const read = store.read()

    expect(read.ok).toBe(false)
    if (!read.ok) {
      expect(read.error.kind).toBe("invalid")
    }
    rmSync(dataDir, { recursive: true, force: true })
  })

  test("creates a missing data directory on write", () => {
    const dataDir = path.join(makeDataDir(), "nested", "data")
    const store = makeDaemonStateFileStore({ path: daemonStateFilePath(dataDir) })

    store.write(makeState())

    expect(store.read().ok).toBe(true)
    rmSync(path.dirname(path.dirname(dataDir)), { recursive: true, force: true })
  })

  test("leaves only the state file behind after a write", () => {
    const dataDir = makeDataDir()
    const store = makeDaemonStateFileStore({ path: daemonStateFilePath(dataDir) })

    store.write(makeState())
    store.write(makeState({ pid: 4322 }))

    expect(readdirSync(dataDir)).toEqual(["daemon-state.json"])
    expect(readFileSync(daemonStateFilePath(dataDir), "utf8")).toContain("4322")
    rmSync(dataDir, { recursive: true, force: true })
  })
})

describe("node request stop", () => {
  test("signals a live process and reports false for a dead pid", async () => {
    const requestStop = makeNodeRequestStop()
    const child = Bun.spawn(["sleep", "30"], { stdio: ["ignore", "ignore", "ignore"] })

    try {
      expect(requestStop(child.pid)).toBe(true)
      await child.exited
      expect(requestStop(child.pid)).toBe(false)
    } finally {
      child.kill()
    }
  })
})
