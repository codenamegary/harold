import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { CONNECTION_TEST_PATH, ConnectionTestResponseSchema } from "contracts/http/connection-test"
import { DEVICES_PATH } from "contracts/http/device"
import { ValidationProblemSchema } from "contracts/http/error"
import { createConnectionTestService } from "./connection.test.service"
import { registerConnectionTestRoutes } from "./routes"
import {
  cleanupTestAppResources,
  createTestApp,
  createTestAppResources,
} from "../test-support/create-test-app"
import {
  createRuntimeSettingsRepository,
  seedDefaultsFromConfig,
} from "../runtime-settings/repository"
import { parseConfig } from "../config/config"
import { createDeviceService } from "../device/service"
import { createDeviceRepository } from "../device/repository"
import Fastify from "fastify"

describe("connection test API", () => {
  const resources = createTestAppResources()
  let dataDir = ""

  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(os.tmpdir(), "agent-server-connection-test-"))
    resources.addTempDir(dataDir)
  })

  afterEach(async () => {
    await cleanupTestAppResources(resources)
  })

  test("POST returns 400 when advertised URL is missing", async () => {
    const { app } = await createTestApp(resources, dataDir)

    const response = await app.inject({
      method: "POST",
      url: CONNECTION_TEST_PATH,
    })

    expect(response.statusCode).toBe(400)
    ValidationProblemSchema.parse(JSON.parse(response.body))
  })

  test("POST returns classified checks and revokes probe device on pass path", async () => {
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

    const { database } = await createTestApp(resources, dataDir)
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

    const probeApp = Fastify()
    registerConnectionTestRoutes(probeApp, connectionTestService)
    resources.addApp(probeApp)

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

    const { database } = await createTestApp(resources, dataDir)
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

    const probeApp = Fastify()
    registerConnectionTestRoutes(probeApp, connectionTestService)
    resources.addApp(probeApp)

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

    const { database } = await createTestApp(resources, dataDir)
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

    const probeApp = Fastify()
    registerConnectionTestRoutes(probeApp, connectionTestService)
    resources.addApp(probeApp)

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

    const { database } = await createTestApp(resources, dataDir)
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

    const probeApp = Fastify()
    registerConnectionTestRoutes(probeApp, connectionTestService)
    resources.addApp(probeApp)

    await probeApp.inject({
      method: "POST",
      url: CONNECTION_TEST_PATH,
    })

    expect(requestedUrl).toBe(`https://agents.example.com:8443${DEVICES_PATH}`)
  })
})
