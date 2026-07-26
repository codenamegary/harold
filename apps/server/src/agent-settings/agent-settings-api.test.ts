import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import {
  AgentSettingsCollectionSchema,
  AgentSettingsSchema,
  DetectAgentPathResponseSchema,
} from "contracts/http/agent-settings"
import { createServer } from "../bootstrap/create-server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/open-database"
import { createRuntime } from "../runtime/runtime"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn, validateExecutablePath } from "../agent-settings/validate-agent-path"

const tempDirs: string[] = []
const apps: Awaited<ReturnType<typeof createServer>>[] = []

const createTempDataDir = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-agent-settings-api-"))
  tempDirs.push(dir)
  return dir
}

const acceptTestExecutablePath: ValidateExecutablePathFn = () => true

const createTestApp = async (
  dataDir: string,
  whichFn?: WhichFn,
  validateExecutablePathFn: ValidateExecutablePathFn = acceptTestExecutablePath,
) => {
  const config = parseConfig({
    AGENT_SERVER_HOST: "127.0.0.1",
    AGENT_SERVER_PORT: "0",
    AGENT_SERVER_DATA_DIR: dataDir,
  })
  const database = openDatabase({ dataDir: config.dataDir })
  const runtime = createRuntime("0.1.0")
  const app = await createServer({
    config,
    runtime,
    database,
    whichFn,
    validateExecutablePathFn,
  })
  apps.push(app)
  return { app, database, config }
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const findAgent = (
  collection: ReturnType<typeof AgentSettingsCollectionSchema.parse>,
  agentId: "cursor" | "claude",
) => {
  const agent = collection.items.find((item) => item.id === agentId)
  if (!agent) {
    throw new Error(`Missing agent ${agentId}`)
  }
  return agent
}

describe("GET /v1/settings/agents", () => {
  test("returns all agents disabled by default", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "GET",
      url: "/v1/settings/agents",
    })

    const body = AgentSettingsCollectionSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.items).toHaveLength(2)

    const cursor = findAgent(body, "cursor")
    expect(cursor.enabled).toBe(false)
    expect(cursor.available).toBe(true)
    expect(cursor.path).toBeNull()

    const claude = findAgent(body, "claude")
    expect(claude.enabled).toBe(false)
    expect(claude.available).toBe(false)
    expect(claude.path).toBeNull()
  })
})

describe("POST /v1/settings/agents/:agentId/detect-path", () => {
  test("returns detected path without persisting", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(dataDir, whichFn)

    const response = await app.inject({
      method: "POST",
      url: "/v1/settings/agents/cursor/detect-path",
    })

    const body = DetectAgentPathResponseSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.path).toBe(detectedPath)

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/settings/agents",
    })
    const listBody = AgentSettingsCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(findAgent(listBody, "cursor").path).toBeNull()
  })

  test("returns 404 when detect fails", async () => {
    const dataDir = await createTempDataDir()
    const whichFn: WhichFn = () => undefined
    const { app } = await createTestApp(dataDir, whichFn)

    const response = await app.inject({
      method: "POST",
      url: "/v1/settings/agents/cursor/detect-path",
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(404)
    expect(body.title).toBe("Agent executable not found")
  })
})

describe("PATCH /v1/settings/agents/:agentId", () => {
  test("enables cursor and auto-detects executable path", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(dataDir, whichFn)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })

    const body = AgentSettingsSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.enabled).toBe(true)
    expect(body.path).toBe(detectedPath)
  })

  test("returns 404 when enable auto-detect fails", async () => {
    const dataDir = await createTempDataDir()
    const whichFn: WhichFn = () => undefined
    const { app } = await createTestApp(dataDir, whichFn)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(404)
    expect(body.title).toBe("Agent executable not found")
  })

  test("disables cursor and keeps stored path", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(dataDir, whichFn)

    await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: false },
    })

    const body = AgentSettingsSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.enabled).toBe(false)
    expect(body.path).toBe(detectedPath)
  })

  test("re-enables cursor without re-detecting when path is already stored", async () => {
    const dataDir = await createTempDataDir()
    const storedPath = "/opt/custom/agent"
    const whichFn: WhichFn = () => "/usr/local/bin/agent"
    const { app } = await createTestApp(dataDir, whichFn)

    await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: storedPath },
    })

    await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: false },
    })

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })

    const body = AgentSettingsSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.enabled).toBe(true)
    expect(body.path).toBe(storedPath)
  })

  test("returns 400 when re-enabling with an invalid stored path", async () => {
    const dataDir = await createTempDataDir()
    const storedPath = "/opt/custom/agent"
    const { app: setupApp } = await createTestApp(dataDir)

    await setupApp.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: storedPath },
    })

    await setupApp.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: false },
    })

    await setupApp.close()

    const { app } = await createTestApp(dataDir, undefined, validateExecutablePath)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.title).toBe("Invalid agent executable path")
  })

  test("sets path with manual override", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: "/opt/custom/agent" },
    })

    const body = AgentSettingsSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.enabled).toBe(true)
    expect(body.path).toBe("/opt/custom/agent")
  })

  test("returns 400 for invalid executable path", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir, undefined, validateExecutablePath)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: "/does/not/exist" },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.title).toBe("Invalid agent executable path")
  })

  test("rejects null path override", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: null },
    })

    expect(response.statusCode).toBe(400)
  })

  test("returns 409 when enabling claude", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/claude",
      payload: { enabled: true },
    })

    const body = ConflictProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(409)
    expect(response.headers["content-type"]).toStartWith("application/problem+json")
    expect(body.title).toBe("Agent cannot be enabled")
  })

  test("returns 400 for invalid agent id", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/unknown",
      payload: { enabled: true },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(response.headers["content-type"]).toStartWith("application/problem+json")
    expect(body.errors[0]?.pointer).toBe("#")
  })
})

describe("agent settings durability", () => {
  test("keeps settings across server restart", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined

    const firstConfig = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const firstDatabase = openDatabase({ dataDir: firstConfig.dataDir })
    const firstRuntime = createRuntime("0.1.0")
    const firstApp = await createServer({
      config: firstConfig,
      runtime: firstRuntime,
      database: firstDatabase,
      whichFn,
      validateExecutablePathFn: acceptTestExecutablePath,
    })

    await firstApp.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })

    await firstApp.close()
    firstDatabase.close()

    const secondDatabase = openDatabase({ dataDir })
    const secondRuntime = createRuntime("0.1.0")
    const secondApp = await createServer({
      config: firstConfig,
      runtime: secondRuntime,
      database: secondDatabase,
      whichFn,
      validateExecutablePathFn: acceptTestExecutablePath,
    })
    apps.push(secondApp)

    const response = await secondApp.inject({
      method: "GET",
      url: "/v1/settings/agents",
    })
    const body = AgentSettingsCollectionSchema.parse(JSON.parse(response.body))
    const cursor = findAgent(body, "cursor")

    expect(cursor.enabled).toBe(true)
    expect(cursor.path).toBe(detectedPath)

    secondDatabase.close()
  })
})
