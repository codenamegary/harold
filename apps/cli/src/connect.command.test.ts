import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import YAML from "yaml"
import {
  RuntimeSettingsFileStore,
  makeRuntimeSettingsFileStore,
} from "server/runtime-settings/file-store"
import { ConnectColors, ConnectDeps, runConnect } from "./connect.command"

const statusBody = JSON.stringify({
  version: "0.2.1",
  state: "online",
  bindAddress: "127.0.0.1",
  port: 3847,
  startedAt: "2026-01-01T00:00:00.000Z",
  acp: { state: "ready", activeSessions: 2 },
})

const identityColors: ConnectColors = {
  green: (text) => text,
  red: (text) => text,
  dim: (text) => text,
}

const tempDirs: string[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "harold-connect-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const makeDeps = (overrides: Partial<ConnectDeps> = {}): ConnectDeps & { lines: string[] } => {
  const lines: string[] = []
  const deps: ConnectDeps = {
    fetchStatus: async () => ({
      ok: true,
      response: { status: 200, body: statusBody },
    }),
    makeSettingsStore: (): RuntimeSettingsFileStore => {
      throw new Error("no settings store should be created without a URL")
    },
    which: () => false,
    writeLine: (line) => lines.push(line),
    colors: identityColors,
    ...overrides,
  }
  return { ...deps, lines }
}

const readSettings = async (dataDir: string) =>
  YAML.parse(await readFile(path.join(dataDir, "settings.yml"), "utf8")) as {
    advertisedUrl: string | null
    advertisedUrlEnabled: boolean
  }

describe("runConnect", () => {
  test("verifies an https advertised endpoint and persists it as enabled", async () => {
    const dataDir = await createTempDataDir()
    const deps = makeDeps({
      makeSettingsStore: (dir) => makeRuntimeSettingsFileStore({ dataDir: dir }),
    })

    const exitCode = await runConnect({
      options: { advertisedUrl: "https://agents.example.com" },
      dataDir,
      deps,
    })

    expect(exitCode).toBe(0)
    const settings = await readSettings(dataDir)
    expect(settings.advertisedUrl).toBe("https://agents.example.com")
    expect(settings.advertisedUrlEnabled).toBe(true)

    const output = deps.lines.join("\n")
    expect(output).toContain("Verified https://agents.example.com")
    expect(output).toContain("https://agents.example.com/v1/status")
    expect(output).toContain("Saved advertised URL")
    expect(output).toContain("harold pair")
  })

  test("verifies and persists a loopback http advertised endpoint", async () => {
    const dataDir = await createTempDataDir()
    const requestedUrls: string[] = []
    const deps = makeDeps({
      fetchStatus: async (statusUrl) => {
        requestedUrls.push(statusUrl)
        return { ok: true, response: { status: 200, body: statusBody } }
      },
      makeSettingsStore: (dir) => makeRuntimeSettingsFileStore({ dataDir: dir }),
    })

    const exitCode = await runConnect({
      options: { advertisedUrl: "http://127.0.0.1:3847" },
      dataDir,
      deps,
    })

    expect(exitCode).toBe(0)
    expect(requestedUrls).toEqual(["http://127.0.0.1:3847/v1/status"])
    const settings = await readSettings(dataDir)
    expect(settings.advertisedUrl).toBe("http://127.0.0.1:3847")
  })

  test("--check verifies without persisting", async () => {
    const dataDir = await createTempDataDir()
    const deps = makeDeps({
      makeSettingsStore: (dir) => makeRuntimeSettingsFileStore({ dataDir: dir }),
    })

    const exitCode = await runConnect({
      options: { advertisedUrl: "https://agents.example.com", check: true },
      dataDir,
      deps,
    })

    expect(exitCode).toBe(0)
    let settingsFileExists = true
    try {
      await readFile(path.join(dataDir, "settings.yml"), "utf8")
    } catch {
      settingsFileExists = false
    }
    expect(settingsFileExists).toBe(false)
    expect(deps.lines.join("\n")).toContain("without persisting")
  })

  test("exits non-zero and explains when the endpoint is unreachable", async () => {
    const dataDir = await createTempDataDir()
    const deps = makeDeps({
      fetchStatus: async () => ({ ok: false, detail: "connect ECONNREFUSED" }),
    })

    const exitCode = await runConnect({
      options: { advertisedUrl: "https://agents.example.com" },
      dataDir,
      deps,
    })

    expect(exitCode).toBe(1)
    const output = deps.lines.join("\n")
    expect(output).toContain("unreachable")
    expect(output).toContain("connect ECONNREFUSED")
  })

  test("exits non-zero for a non-2xx status answer", async () => {
    const dataDir = await createTempDataDir()
    const deps = makeDeps({
      fetchStatus: async () => ({
        ok: true,
        response: { status: 503, body: "" },
      }),
    })

    const exitCode = await runConnect({
      options: { advertisedUrl: "https://agents.example.com" },
      dataDir,
      deps,
    })

    expect(exitCode).toBe(1)
    expect(deps.lines.join("\n")).toContain("503")
  })

  test("exits non-zero for an http URL on a non-loopback host", async () => {
    const dataDir = await createTempDataDir()
    const deps = makeDeps()

    const exitCode = await runConnect({
      options: { advertisedUrl: "http://agents.example.com" },
      dataDir,
      deps,
    })

    expect(exitCode).toBe(1)
    expect(deps.lines.join("\n")).toContain("loopback")
  })

  test("recipe without a URL prints detection and guidance, then exits non-zero", async () => {
    const dataDir = await createTempDataDir()
    const deps = makeDeps({ which: () => true })

    const exitCode = await runConnect({
      options: { recipe: "tailscale" },
      dataDir,
      deps,
    })

    expect(exitCode).toBe(1)
    const output = deps.lines.join("\n")
    expect(output).toContain("tailscale serve")
    expect(output).toContain("tailscale funnel")
    expect(output).toContain("--advertised-url")
    const settings = await readSettings(dataDir).catch(() => null)
    expect(settings).toBeNull()
  })

  test("recipe with a URL runs the shared verify-and-persist flow", async () => {
    const dataDir = await createTempDataDir()
    const deps = makeDeps({
      which: () => true,
      makeSettingsStore: (dir) => makeRuntimeSettingsFileStore({ dataDir: dir }),
    })

    const exitCode = await runConnect({
      options: { recipe: "custom", advertisedUrl: "https://agents.example.com" },
      dataDir,
      deps,
    })

    expect(exitCode).toBe(0)
    const settings = await readSettings(dataDir)
    expect(settings.advertisedUrl).toBe("https://agents.example.com")
    expect(deps.lines.join("\n")).toContain("Verified https://agents.example.com")
  })

  test("unknown recipe exits non-zero and lists the choices", async () => {
    const dataDir = await createTempDataDir()
    const deps = makeDeps()

    const exitCode = await runConnect({
      options: { recipe: "carrier-pigeon" },
      dataDir,
      deps,
    })

    expect(exitCode).toBe(1)
    const output = deps.lines.join("\n")
    expect(output).toContain("Unknown recipe")
    expect(output).toContain("reverse-proxy")
    expect(output).toContain("custom")
  })

  test("no URL and no recipe prints usage guidance and exits non-zero", async () => {
    const dataDir = await createTempDataDir()
    const deps = makeDeps()

    const exitCode = await runConnect({ options: {}, dataDir, deps })

    expect(exitCode).toBe(1)
    expect(deps.lines.join("\n")).toContain("--advertised-url")
  })
})
