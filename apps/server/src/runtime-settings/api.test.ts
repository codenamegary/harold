import { describe, expect, test } from "bun:test"
import { mkdir, readFile } from "node:fs/promises"
import path from "node:path"
import { ValidationProblemSchema } from "contracts/http/error"
import {
  RuntimeSettingsSchema,
  RuntimeSettingsViewSchema,
  UpdateRuntimeSettingsResponseSchema,
} from "contracts/http/runtime-settings"
import YAML from "yaml"
import { catalogAgentIds } from "../acp/catalog/generated/catalog.agents.generated"
import { parseConfig } from "../config/config"
import { readEnvBindOverrides } from "../config/env.bind.overrides"
import { bootTestApp, bootTestDirectory } from "../test-support/test.harness"
import { createAppliedRuntimeSettingsHolder } from "./applied.runtime.settings"
import {
  makeRuntimeSettingsFileStore,
  seedDefaultsFromConfig,
  settingsFileName,
} from "./runtime-settings.file.adapters"
import { buildAppliedRuntimeSettings } from "./resolve.runtime.settings.state"

const createTestApp = (options?: { envBindOverrides?: ReturnType<typeof readEnvBindOverrides> }) =>
  bootTestApp({
    setup: ({ config }) => {
      const envBindOverrides = options?.envBindOverrides ?? readEnvBindOverrides({})
      const runtimeSettingsStore = makeRuntimeSettingsFileStore({
        dataDir: config.dataDir,
      })
      const persisted = runtimeSettingsStore.get()
      const appliedRuntimeSettings = createAppliedRuntimeSettingsHolder(
        buildAppliedRuntimeSettings({ persisted, envOverrides: envBindOverrides }),
      )
      const applied = appliedRuntimeSettings.get()
      return {
        config: { ...config, host: applied.bindHost, port: applied.bindPort },
        runtimeSettingsStore,
        appliedRuntimeSettings,
        envBindOverrides,
      }
    },
  })

describe("GET /v1/settings/runtime", () => {
  test("returns seeded defaults and writes settings.yml", async () => {
    const { app, dataDir } = await createTestApp()

    const response = await app.inject({
      method: "GET",
      url: "/v1/settings/runtime",
    })

    const body = RuntimeSettingsViewSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.settings).toEqual({
      advertisedUrl: null,
      advertisedUrlEnabled: true,
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
    const { app } = await createTestApp({
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
    const { app, dataDir } = await createTestApp()
    const allowedDir = path.join(dataDir, "allowed")
    await mkdir(allowedDir)

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
    const { app } = await createTestApp()

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
    const { app } = await createTestApp()

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { logPath: "/tmp/harold.log" },
    })

    const body = UpdateRuntimeSettingsResponseSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.restartRequired).toBe(true)
    expect(body.settings.logPath).toBe("/tmp/harold.log")
  })

  test("clears advertised URL with null", async () => {
    const { app } = await createTestApp()

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
    const { app } = await createTestApp()

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
    const { app } = await createTestApp()

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
    const { app } = await createTestApp()

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
    const { app } = await createTestApp()

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
    const { app, database } = await createTestApp()

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

    expect(agents.map((agent) => agent.agent_id)).toEqual([...catalogAgentIds])
    expect(agents.every((agent) => agent.enabled === 0)).toBe(true)
  })
})

describe("runtime settings durability", () => {
  test("keeps settings across server restart via settings.yml", async () => {
    const first = await createTestApp()

    await first.app.inject({
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: {
        advertisedUrl: "https://edge.example.com",
        bindPort: 4100,
        logLevel: "warn",
        trustedProxies: ["192.168.0.0/16"],
      },
    })

    const second = await first.reopen()

    const response = await second.app.inject({
      method: "GET",
      url: "/v1/settings/runtime",
    })
    const body = RuntimeSettingsViewSchema.parse(JSON.parse(response.body))

    expect(body.settings.advertisedUrl).toBe("https://edge.example.com")
    expect(body.settings.bindPort).toBe(4100)
    expect(body.settings.logLevel).toBe("warn")
    expect(body.settings.trustedProxies).toEqual(["192.168.0.0/16"])
  })

  test("seeds missing settings.yml bind port from env config defaults", async () => {
    const dataDir = await bootTestDirectory()
    const config = parseConfig({
      HAROLD_HOST: "127.0.0.1",
      HAROLD_PORT: "4123",
      HAROLD_DATA_DIR: dataDir,
    })
    const store = makeRuntimeSettingsFileStore({
      dataDir: config.dataDir,
      seedDefaults: seedDefaultsFromConfig(config),
    })

    expect(store.get().bindPort).toBe(4123)
    const fileRaw = await readFile(path.join(dataDir, settingsFileName), "utf8")
    expect(fileRaw).toContain("bindPort: 4123")
  })
})

describe("createServer runtime settings seed", () => {
  test("bare createServer seeds missing settings.yml from config", async () => {
    const { app, dataDir } = await bootTestApp({
      config: { host: "127.0.0.1", port: 4123 },
    })

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
