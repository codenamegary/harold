import { describe, expect, test } from "bun:test"
import { CONNECTION_TEST_PATH, ConnectionTestResponseSchema } from "contracts/http/connection-test"
import { DEVICES_PATH } from "contracts/http/device"
import { ValidationProblemSchema } from "contracts/http/error"
import { createConnectionTestService } from "./connection.test.service"
import { registerConnectionTestRoutes } from "./routes"
import { bootTestApp, bootTestDatabase, registerTestApp } from "../test-support/test.harness"
import {
  createRuntimeSettingsRepository,
  seedDefaultsFromConfig,
} from "../runtime-settings/repository"
import { parseConfig } from "../config/config"
import { createDeviceService } from "../device/service"
import { createDeviceRepository } from "../device/repository"
import Fastify from "fastify"

describe("connection test API", () => {
  test("POST returns 400 when advertised URL is missing", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      method: "POST",
      url: CONNECTION_TEST_PATH,
    })

    expect(response.statusCode).toBe(400)
    ValidationProblemSchema.parse(JSON.parse(response.body))
  })

  test("POST returns classified checks and revokes probe device on pass path", async () => {
    const { database, dataDir } = await bootTestDatabase()
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "3847",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const runtimeSettingsRepository = createRuntimeSettingsRepository({
      dataDir,
      seedDefaults: seedDefaultsFromConfig(config),
    })
    runtimeSettingsRepository.update({
      advertisedUrl: "https://agents.example.com",
    })

    const deviceRepository = createDeviceRepository(database)
    const deviceService = createDeviceService({
      database,
      deviceRepository,
      config,
      runtimeSettingsRepository,
    })

    const advertisedUrl = "https://agents.example.com"
    const connectionTestService = createConnectionTestService({
      runtimeSettingsRepository,
      deviceService,
      deps: {
        lookupHost: async () => [{ address: "127.0.0.1", family: 4 }],
        connectTcp: async () => undefined,
        verifyTls: async () => ({
          id: "tls",
          status: "pass",
          message: "TLS ok",
        }),
        fetchDeviceAuth: async () => ({
          id: "device-auth",
          status: "pass",
          message: "Auth ok",
        }),
      },
    })

    const probeApp = registerTestApp(Fastify())
    registerConnectionTestRoutes(probeApp, connectionTestService)

    const beforeDevices = deviceRepository.list({ limit: 100 })
    expect(beforeDevices.ok).toBe(true)

    const response = await probeApp.inject({
      method: "POST",
      url: CONNECTION_TEST_PATH,
    })

    const body = ConnectionTestResponseSchema.parse(JSON.parse(response.body))
    expect(body.advertisedUrl).toBe(advertisedUrl)
    expect(body.canContinue).toBe(true)
    expect(body.canContinueAnyway).toBe(false)
    expect(body.checks.map((check) => check.id)).toEqual(["dns", "tls", "device-auth"])

    const afterDevices = deviceRepository.list({ limit: 100 })
    expect(afterDevices.ok).toBe(true)
    if (!afterDevices.ok || !beforeDevices.ok) {
      throw new Error("device list failed")
    }

    const probeDevices = afterDevices.value.items.filter(
      (item) => item.name === "Connection test probe",
    )
    expect(probeDevices).toHaveLength(1)
    expect(probeDevices[0]?.state).toBe("revoked")
  })

  test("POST classifies DNS, TLS, and auth failures", async () => {
    const { database, dataDir } = await bootTestDatabase()
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "3847",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const runtimeSettingsRepository = createRuntimeSettingsRepository({
      dataDir,
      seedDefaults: seedDefaultsFromConfig(config),
    })
    runtimeSettingsRepository.update({
      advertisedUrl: "https://agents.example.com",
    })

    const deviceRepository = createDeviceRepository(database)
    const deviceService = createDeviceService({
      database,
      deviceRepository,
      config,
      runtimeSettingsRepository,
    })

    const connectionTestService = createConnectionTestService({
      runtimeSettingsRepository,
      deviceService,
      deps: {
        lookupHost: async () => {
          throw new Error("ENOTFOUND agents.example.com")
        },
        connectTcp: async () => undefined,
        verifyTls: async () => ({
          id: "tls",
          status: "fail",
          message: "should not run",
        }),
        fetchDeviceAuth: async () => ({
          id: "device-auth",
          status: "fail",
          message: "should not run",
        }),
      },
    })

    const probeApp = registerTestApp(Fastify())
    registerConnectionTestRoutes(probeApp, connectionTestService)

    const response = await probeApp.inject({
      method: "POST",
      url: CONNECTION_TEST_PATH,
    })

    const body = ConnectionTestResponseSchema.parse(JSON.parse(response.body))
    expect(body.checks[0]?.status).toBe("fail")
    expect(body.checks[0]?.id).toBe("dns")
    expect(body.canContinue).toBe(false)
    expect(body.canContinueAnyway).toBe(false)
  })

  test("POST warns on self-signed TLS and allows continue anyway when auth passes", async () => {
    const { database, dataDir } = await bootTestDatabase()
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "3847",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const runtimeSettingsRepository = createRuntimeSettingsRepository({
      dataDir,
      seedDefaults: seedDefaultsFromConfig(config),
    })
    runtimeSettingsRepository.update({
      advertisedUrl: "https://agents.example.com",
    })

    const deviceRepository = createDeviceRepository(database)
    const deviceService = createDeviceService({
      database,
      deviceRepository,
      config,
      runtimeSettingsRepository,
    })

    const connectionTestService = createConnectionTestService({
      runtimeSettingsRepository,
      deviceService,
      deps: {
        lookupHost: async () => [{ address: "127.0.0.1", family: 4 }],
        connectTcp: async () => undefined,
        verifyTls: async () => ({
          id: "tls",
          status: "warn",
          message: "Certificate is self-signed",
        }),
        fetchDeviceAuth: async () => ({
          id: "device-auth",
          status: "pass",
          message: "Auth ok",
        }),
      },
    })

    const probeApp = registerTestApp(Fastify())
    registerConnectionTestRoutes(probeApp, connectionTestService)

    const response = await probeApp.inject({
      method: "POST",
      url: CONNECTION_TEST_PATH,
    })

    const body = ConnectionTestResponseSchema.parse(JSON.parse(response.body))
    expect(body.checks[1]?.status).toBe("warn")
    expect(body.canContinue).toBe(false)
    expect(body.canContinueAnyway).toBe(true)
  })

  test("device auth probe targets devices collection path", async () => {
    const { database, dataDir } = await bootTestDatabase()
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "3847",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const runtimeSettingsRepository = createRuntimeSettingsRepository({
      dataDir,
      seedDefaults: seedDefaultsFromConfig(config),
    })
    runtimeSettingsRepository.update({
      advertisedUrl: "https://agents.example.com:8443",
    })

    const deviceRepository = createDeviceRepository(database)
    const deviceService = createDeviceService({
      database,
      deviceRepository,
      config,
      runtimeSettingsRepository,
    })

    let requestedUrl = ""
    const connectionTestService = createConnectionTestService({
      runtimeSettingsRepository,
      deviceService,
      deps: {
        lookupHost: async () => [{ address: "127.0.0.1", family: 4 }],
        connectTcp: async () => undefined,
        verifyTls: async () => ({
          id: "tls",
          status: "pass",
          message: "TLS ok",
        }),
        fetchDeviceAuth: async (params) => {
          requestedUrl = params.url
          return {
            id: "device-auth",
            status: "pass",
            message: "Auth ok",
          }
        },
      },
    })

    const probeApp = registerTestApp(Fastify())
    registerConnectionTestRoutes(probeApp, connectionTestService)

    await probeApp.inject({
      method: "POST",
      url: CONNECTION_TEST_PATH,
    })

    expect(requestedUrl).toBe(`https://agents.example.com:8443${DEVICES_PATH}`)
  })
})
