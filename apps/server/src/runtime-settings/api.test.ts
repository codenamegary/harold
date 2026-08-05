import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { ValidationProblemSchema } from "contracts/http/error"
import {
  RuntimeSettingsSchema,
  RuntimeSettingsViewSchema,
  UpdateRuntimeSettingsResponseSchema,
} from "contracts/http/runtime-settings"
import YAML from "yaml"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { readEnvBindOverrides } from "../config/env.bind.overrides"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import { createAppliedRuntimeSettingsHolder } from "./applied.runtime.settings"
import {
  createRuntimeSettingsRepository,
  seedDefaultsFromConfig,
  settingsFileName,
} from "./repository"
import { buildAppliedRuntimeSettings } from "./resolve.runtime.settings.state"

const tempDirs: string[] = []
const apps: Awaited<ReturnType<typeof createServer>>["app"][] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-runtime-settings-api-"))
  tempDirs.push(dir)
  return dir
}

const createTestApp = async (
  dataDir: string,
  options?: { envBindOverrides?: ReturnType<typeof readEnvBindOverrides> },
) => {
  const envBindOverrides = options?.envBindOverrides ?? readEnvBindOverrides({})
  const config = parseConfig({
    AGENT_SERVER_HOST: "127.0.0.1",
    AGENT_SERVER_PORT: "0",
    AGENT_SERVER_DATA_DIR: dataDir,
  })
  const database = openDatabase({ dataDir: config.dataDir })
  const runtime = createRuntime("0.1.0")
  const runtimeSettingsRepository = createRuntimeSettingsRepository({
    dataDir: config.dataDir,
  })
  const persisted = runtimeSettingsRepository.get()
  const appliedRuntimeSettings = createAppliedRuntimeSettingsHolder(
    buildAppliedRuntimeSettings({ persisted, envOverrides: envBindOverrides }),
  )
  const applied = appliedRuntimeSettings.get()
  const { app } = await createServer({
    config: {
      host: applied.bindHost,
      port: applied.bindPort,
      dataDir: config.dataDir,
    },
    runtime,
    database,
    runtimeSettingsRepository,
    appliedRuntimeSettings,
    envBindOverrides,
  })
  apps.push(app)
  return { app, database, config, runtimeSettingsRepository, appliedRuntimeSettings }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("GET /v1/settings/runtime", () => {
  test("returns seeded defaults and writes settings.yml", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "GET",
      url: "/v1/settings/runtime",
    })

    const body = RuntimeSettingsViewSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.settings).toEqual({
      advertisedUrl: null,
      trustedProxies: [],
      bindHost: "127.0.0.1",
      bindPort: 3847,
      logLevel: "info",
      logPath: null,
      allowedRoots: [],
    })
    expect(body.restartRequired).toBe(false)
    expect(body.effective).toEqual({
      bindHost: "127.0.0.1",
      bindPort: 3847,
      logPath: null,
    })
    expect(body.overrides).toEqual({})

    const fileRaw = await readFile(path.join(dataDir, settingsFileName), "utf8")
    expect(RuntimeSettingsSchema.parse(YAML.parse(fileRaw))).toEqual(body.settings)
  })

  test("reports env bind port override on GET", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir, {
      envBindOverrides: { bindPort: 4123 },
    })

    const response = await app.inject({
      method: "GET",
      url: "/v1/settings/runtime",
    })

    const body = RuntimeSettingsViewSchema.parse(JSON.parse(response.body))

    expect(body.settings.bindPort).toBe(3847)
    expect(body.effective.bindPort).toBe(4123)
    expect(body.overrides).toEqual({ bindPort: "env" })
    expect(body.restartRequired).toBe(true)
  })
})

describe("PATCH /v1/settings/runtime", () => {
  test("persists live fields without restartRequired", async () => {
    const dataDir = await createTempDataDir()
    const allowedDir = path.join(dataDir, "allowed")
    await mkdir(allowedDir)
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: {
        advertisedUrl: "https://agents.example.com",
        trustedProxies: ["10.0.0.0/8", "::1"],
        logLevel: "debug",
        allowedRoots: [allowedDir],
      },
    })

    const body = UpdateRuntimeSettingsResponseSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.restartRequired).toBe(false)
    expect(body.settings.advertisedUrl).toBe("https://agents.example.com")
    expect(body.settings.trustedProxies).toEqual(["10.0.0.0/8", "::1"])
    expect(body.settings.logLevel).toBe("debug")
    expect(body.settings.allowedRoots).toEqual([path.resolve(allowedDir)])
    expect(app.log.level).toBe("debug")

    const getResponse = await app.inject({
      method: "GET",
      url: "/v1/settings/runtime",
    })
    const getBody = RuntimeSettingsViewSchema.parse(JSON.parse(getResponse.body))
    expect(getBody.settings).toEqual(body.settings)
  })

  test("sets restartRequired when bind port changes", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { bindPort: 4000 },
    })

    const body = UpdateRuntimeSettingsResponseSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.restartRequired).toBe(true)
    expect(body.settings.bindPort).toBe(4000)
    expect(body.effective.bindPort).toBe(3847)
  })

  test("sets restartRequired when log path changes", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { logPath: "/tmp/agent-server.log" },
    })

    const body = UpdateRuntimeSettingsResponseSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.restartRequired).toBe(true)
    expect(body.settings.logPath).toBe("/tmp/agent-server.log")
  })

  test("clears advertised URL with null", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { advertisedUrl: "https://agents.example.com" },
    })

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { advertisedUrl: null },
    })

    const body = UpdateRuntimeSettingsResponseSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.settings.advertisedUrl).toBeNull()
  })

  test("clears advertised URL with empty string", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { advertisedUrl: "https://agents.example.com" },
    })

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { advertisedUrl: "" },
    })

    const body = UpdateRuntimeSettingsResponseSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.settings.advertisedUrl).toBeNull()
  })

  test("returns Problem+JSON for http advertised URL", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { advertisedUrl: "http://agents.example.com" },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(response.headers["content-type"]).toStartWith("application/problem+json")
    expect(body.errors[0]?.pointer).toBe("#/advertisedUrl")
  })

  test("returns Problem+JSON for hostname trusted proxy", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { trustedProxies: ["proxy.example.com"] },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(response.headers["content-type"]).toStartWith("application/problem+json")
    expect(body.errors[0]?.pointer).toBe("#/trustedProxies/0")
  })

  test("returns Problem+JSON for non-loopback bind host", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { bindHost: "0.0.0.0" },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(response.headers["content-type"]).toStartWith("application/problem+json")
    expect(body.errors[0]?.pointer).toBe("#/bindHost")
  })

  test("does not touch agent_settings", async () => {
    const dataDir = await createTempDataDir()
    const { app, database } = await createTestApp(dataDir)

    await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { logLevel: "warn" },
    })

    const agents = database.sqlite
      .query<{ agent_id: string; enabled: number }, []>(
        "SELECT agent_id, enabled FROM agent_settings ORDER BY agent_id",
      )
      .all()

    expect(agents).toEqual([
      { agent_id: "claude", enabled: 0 },
      { agent_id: "cursor", enabled: 0 },
    ])
  })
})

describe("runtime settings durability", () => {
  test("keeps settings across server restart via settings.yml", async () => {
    const dataDir = await createTempDataDir()

    const firstConfig = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const firstDatabase = openDatabase({ dataDir: firstConfig.dataDir })
    const firstRuntime = createRuntime("0.1.0")
    const firstRepository = createRuntimeSettingsRepository({
      dataDir: firstConfig.dataDir,
    })
    const firstPersisted = firstRepository.get()
    const firstApplied = createAppliedRuntimeSettingsHolder(
      buildAppliedRuntimeSettings({ persisted: firstPersisted, envOverrides: {} }),
    )
    const firstAppliedValues = firstApplied.get()
    const { app: firstApp } = await createServer({
      config: {
        host: firstAppliedValues.bindHost,
        port: firstAppliedValues.bindPort,
        dataDir: firstConfig.dataDir,
      },
      runtime: firstRuntime,
      database: firstDatabase,
      runtimeSettingsRepository: firstRepository,
      appliedRuntimeSettings: firstApplied,
      envBindOverrides: {},
    })

    await firstApp.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: {
        advertisedUrl: "https://edge.example.com",
        bindPort: 4100,
        logLevel: "warn",
        trustedProxies: ["192.168.0.0/16"],
      },
    })

    await firstApp.close()
    firstDatabase.close()

    const secondDatabase = openDatabase({ dataDir })
    const secondRuntime = createRuntime("0.1.0")
    const secondRepository = createRuntimeSettingsRepository({ dataDir })
    const secondPersisted = secondRepository.get()
    const secondApplied = createAppliedRuntimeSettingsHolder(
      buildAppliedRuntimeSettings({ persisted: secondPersisted, envOverrides: {} }),
    )
    const secondAppliedValues = secondApplied.get()
    const { app: secondApp } = await createServer({
      config: {
        host: secondAppliedValues.bindHost,
        port: secondAppliedValues.bindPort,
        dataDir: firstConfig.dataDir,
      },
      runtime: secondRuntime,
      database: secondDatabase,
      runtimeSettingsRepository: secondRepository,
      appliedRuntimeSettings: secondApplied,
      envBindOverrides: {},
    })
    apps.push(secondApp)

    const response = await secondApp.inject({
      method: "GET",
      url: "/v1/settings/runtime",
    })
    const body = RuntimeSettingsViewSchema.parse(JSON.parse(response.body))

    expect(body.settings.advertisedUrl).toBe("https://edge.example.com")
    expect(body.settings.bindPort).toBe(4100)
    expect(body.settings.logLevel).toBe("warn")
    expect(body.settings.trustedProxies).toEqual(["192.168.0.0/16"])

    secondDatabase.close()
  })

  test("seeds missing settings.yml bind port from env config defaults", async () => {
    const dataDir = await createTempDataDir()
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "4123",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const repository = createRuntimeSettingsRepository({
      dataDir: config.dataDir,
      seedDefaults: seedDefaultsFromConfig(config),
    })

    expect(repository.get().bindPort).toBe(4123)
    const fileRaw = await readFile(path.join(dataDir, settingsFileName), "utf8")
    expect(fileRaw).toContain("bindPort: 4123")
  })
})

describe("createServer runtime settings seed", () => {
  test("bare createServer seeds missing settings.yml from config", async () => {
    const dataDir = await createTempDataDir()
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "4123",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const runtime = createRuntime("0.1.0")
    const { app } = await createServer({
      config,
      runtime,
      database,
    })
    apps.push(app)

    const response = await app.inject({
      method: "GET",
      url: "/v1/settings/runtime",
    })
    const body = RuntimeSettingsViewSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.settings.bindPort).toBe(4123)
    const fileRaw = await readFile(path.join(dataDir, settingsFileName), "utf8")
    expect(fileRaw).toContain("bindPort: 4123")
  })
})
