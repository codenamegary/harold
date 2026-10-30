import { describe, expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { RuntimeSettingsSchema, RuntimeSettingsViewSchema } from "contracts/http/runtime-settings"
import YAML from "yaml"
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

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

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
      return {
        config,
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
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/settings/runtime",
    })

    const body = RuntimeSettingsViewSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.settings).toEqual({
      bindPort: 3847,
      logLevel: "info",
      logPath: null,
    })
    expect(body.restartRequired).toBe(false)
    expect(body.effective).toEqual({
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
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/settings/runtime",
    })

    const body = RuntimeSettingsViewSchema.parse(JSON.parse(response.body))

    expect(body.settings.bindPort).toBe(3847)
    expect(body.effective.bindPort).toBe(4123)
    expect(body.overrides).toEqual({ bindPort: "env" })
    expect(body.restartRequired).toBe(true)
  })

  test("the route is read-only: PATCH is not registered", async () => {
    const { app } = await createTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/runtime",
      payload: { bindPort: 4000 },
    })

    expect(response.statusCode).toBe(404)
  })
})

describe("runtime settings durability", () => {
  test("keeps settings across server restart via settings.yml", async () => {
    const first = await createTestApp()

    const store = first.runtimeSettingsStore
    store.save({ ...store.get(), bindPort: 4100, logLevel: "warn" })

    const second = await first.reopen()

    const response = await second.app.inject({
      headers: authHeaders(second.app),
      method: "GET",
      url: "/v1/settings/runtime",
    })
    const body = RuntimeSettingsViewSchema.parse(JSON.parse(response.body))

    expect(body.settings.bindPort).toBe(4100)
    expect(body.settings.logLevel).toBe("warn")
  })

  test("seeds missing settings.yml bind port from env config defaults", async () => {
    const dataDir = await bootTestDirectory()
    const config = parseConfig({
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
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/settings/runtime",
    })
    const body = RuntimeSettingsViewSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.settings.bindPort).toBe(4123)
    const fileRaw = await readFile(path.join(dataDir, settingsFileName), "utf8")
    expect(fileRaw).toContain("bindPort: 4123")
  })

  test("an unauthenticated client cannot read runtime settings", async () => {
    const { app } = await createTestApp()

    const response = await app.inject({
      method: "GET",
      url: "/v1/settings/runtime",
    })

    expect(response.statusCode).toBe(401)
  })
})
