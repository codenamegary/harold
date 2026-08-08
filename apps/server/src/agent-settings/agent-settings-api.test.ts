import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { catalogAgentIds } from "../acp/catalog/generated/catalog.agents.generated"
import { popularAgentAllowlist } from "../acp/catalog/popular.allowlist"
import {
  InternalProblemSchema,
  NotFoundProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import {
  AgentSettingsCollectionSchema,
  AgentSettingsSchema,
  DetectAgentPathResponseSchema,
  ImportDetectResponseSchema,
} from "contracts/http/agent-settings"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn, validateExecutablePath } from "../agent-settings/validate-agent-path"
import { FetchRegistryFn } from "../agent-settings/agent-settings-repository"

const tempDirs: string[] = []
const apps: Awaited<ReturnType<typeof createServer>>["app"][] = []

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
  fetchRegistryFn?: FetchRegistryFn,
) => {
  const config = parseConfig({
    AGENT_SERVER_HOST: "127.0.0.1",
    AGENT_SERVER_PORT: "0",
    AGENT_SERVER_DATA_DIR: dataDir,
  })
  const database = openDatabase({ dataDir: config.dataDir })
  const runtime = createRuntime("0.1.0")
  const { app } = await createServer({
    config,
    runtime,
    database,
    whichFn,
    validateExecutablePathFn,
    fetchRegistryFn,
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
  agentId: string,
) => {
  const agent = collection.items.find((item) => item.id === agentId)
  if (!agent) {
    throw new Error(`Missing agent ${agentId}`)
  }
  return agent
}

describe("GET /v1/settings/agents", () => {
  test("returns all catalog agents disabled by default with presence and popular", async () => {
    const dataDir = await createTempDataDir()
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app } = await createTestApp(dataDir, whichFn)

    const response = await app.inject({
      method: "GET",
      url: "/v1/settings/agents",
    })

    const body = AgentSettingsCollectionSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.items).toHaveLength(catalogAgentIds.length)

    const cursor = findAgent(body, "cursor")
    expect(cursor.enabled).toBe(false)
    expect(cursor.available).toBe(true)
    expect(cursor.path).toBeNull()
    expect(cursor.present).toBe(true)
    expect(cursor.popular).toBe(true)

    const claudeAcp = findAgent(body, "claude-acp")
    expect(claudeAcp.enabled).toBe(false)
    expect(claudeAcp.available).toBe(true)
    expect(claudeAcp.path).toBeNull()
    expect(claudeAcp.popular).toBe(true)
  })

  test("sorts enabled+present, then popular, then rest", async () => {
    const dataDir = await createTempDataDir()
    const whichFn: WhichFn = (binaryName) => {
      if (binaryName === "agent") {
        return "/usr/local/bin/agent"
      }
      if (binaryName === "opencode") {
        return "/usr/local/bin/opencode"
      }
      return undefined
    }
    const { app } = await createTestApp(dataDir, whichFn)

    await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/opencode",
      payload: { enabled: true },
    })

    const response = await app.inject({
      method: "GET",
      url: "/v1/settings/agents",
    })
    const body = AgentSettingsCollectionSchema.parse(JSON.parse(response.body))

    const ids = body.items.map((item) => item.id)
    expect(ids[0]).toBe("opencode")

    const afterEnabledPresent = body.items.slice(1)
    const popularIds = new Set<string>(popularAgentAllowlist)
    const firstNonPopularIndex = afterEnabledPresent.findIndex(
      (item) => !popularIds.has(item.id),
    )
    expect(firstNonPopularIndex).toBeGreaterThan(0)

    const popularBand = afterEnabledPresent.slice(0, firstNonPopularIndex)
    expect(popularBand.every((item) => item.popular)).toBe(true)
    expect(afterEnabledPresent.slice(firstNonPopularIndex).every((item) => !item.popular)).toBe(
      true,
    )
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
    expect(body.present).toBe(true)
  })

  test("returns 400 and persists enabled when enable auto-detect fails", async () => {
    const dataDir = await createTempDataDir()
    const whichFn: WhichFn = () => undefined
    const { app } = await createTestApp(dataDir, whichFn)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.title).toBe("Could not detect agent path automatically.")
    expect(body.errors[0]?.pointer).toBe("#/path")
    expect(body.errors[0]?.code).toBe("validation.field.path.auto_detect_failed")

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/settings/agents",
    })
    const listBody = AgentSettingsCollectionSchema.parse(JSON.parse(listResponse.body))
    const cursor = findAgent(listBody, "cursor")

    expect(cursor.enabled).toBe(true)
    expect(cursor.path).toBeNull()
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

  test("enables a non-cursor catalog agent with an explicit path", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/bin/npx"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "npx" ? detectedPath : undefined
    const { app } = await createTestApp(dataDir, whichFn)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/claude-acp",
      payload: { enabled: true, path: detectedPath },
    })

    const body = AgentSettingsSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body).toEqual({
      id: "claude-acp",
      displayName: "Claude Agent",
      available: true,
      enabled: true,
      path: detectedPath,
      present: false,
      popular: true,
    })
  })

  test("returns 404 for unknown agent id without a settings row", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/unknown",
      payload: { enabled: true },
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(404)
    expect(body.title).toBe("Agent not found")
  })
})

describe("POST /v1/settings/agents/import/detect and apply", () => {
  test("detect returns present candidates without persisting, apply upserts registry-ahead", async () => {
    const dataDir = await createTempDataDir()
    const whichFn: WhichFn = (binaryName) => {
      if (binaryName === "agent") {
        return "/usr/local/bin/agent"
      }
      if (binaryName === "brand-new") {
        return "/usr/bin/brand-new"
      }
      return undefined
    }

    const fetchRegistryFn: FetchRegistryFn = async () => ({
      version: "test",
      agents: [
        {
          id: "cursor",
          name: "Cursor",
          distribution: {
            binary: {
              "linux-x86_64": {
                archive: "https://example.test/cursor.tgz",
                cmd: "cursor-agent",
                args: ["acp"],
              },
            },
          },
        },
        {
          id: "brand-new-agent",
          name: "Brand New",
          distribution: {
            binary: {
              "linux-x86_64": {
                archive: "https://example.test/brand-new.tgz",
                cmd: "brand-new",
                args: ["acp"],
              },
            },
          },
        },
        {
          id: "missing-binary-agent",
          name: "Missing",
          distribution: {
            binary: {
              "linux-x86_64": {
                archive: "https://example.test/missing.tgz",
                cmd: "missing-bin",
                args: ["acp"],
              },
            },
          },
        },
      ],
    })

    const { app } = await createTestApp(dataDir, whichFn, acceptTestExecutablePath, fetchRegistryFn)

    const detectResponse = await app.inject({
      method: "POST",
      url: "/v1/settings/agents/import/detect",
    })
    const detectBody = ImportDetectResponseSchema.parse(JSON.parse(detectResponse.body))

    expect(detectResponse.statusCode).toBe(200)
    expect(detectBody.items.map((item) => item.id).sort()).toEqual([
      "brand-new-agent",
      "cursor",
    ])
    expect(detectBody.items.find((item) => item.id === "brand-new-agent")).toEqual({
      id: "brand-new-agent",
      displayName: "Brand New",
      present: true,
      path: "/usr/bin/brand-new",
      inCatalog: false,
      alreadyEnabled: false,
      spawn: {
        kind: "binary",
        binaryName: "brand-new",
        command: ["brand-new", "acp"],
        displayName: "Brand New",
        authMethodId: "brand-new-agent",
      },
    })

    const listBeforeApply = AgentSettingsCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "GET",
            url: "/v1/settings/agents",
          })
        ).body,
      ),
    )
    expect(listBeforeApply.items.some((item) => item.id === "brand-new-agent")).toBe(false)

    const applyResponse = await app.inject({
      method: "POST",
      url: "/v1/settings/agents/import/apply",
      payload: {
        agents: [
          {
            id: "brand-new-agent",
            path: "/usr/bin/brand-new",
            spawn: {
              kind: "binary",
              binaryName: "brand-new",
              command: ["brand-new", "acp"],
              displayName: "Brand New",
              authMethodId: "brand-new-agent",
            },
          },
        ],
      },
    })

    const applyBody = AgentSettingsCollectionSchema.parse(JSON.parse(applyResponse.body))
    expect(applyResponse.statusCode).toBe(200)

    const imported = findAgent(applyBody, "brand-new-agent")
    expect(imported).toEqual({
      id: "brand-new-agent",
      displayName: "Brand New",
      available: true,
      enabled: true,
      path: "/usr/bin/brand-new",
      present: true,
      popular: false,
    })
    expect(applyBody.items[0]?.id).toBe("brand-new-agent")
  })

  test("detect returns 502 when registry fetch fails", async () => {
    const dataDir = await createTempDataDir()
    const fetchRegistryFn: FetchRegistryFn = async () => {
      throw new Error("network down")
    }
    const { app } = await createTestApp(dataDir, undefined, acceptTestExecutablePath, fetchRegistryFn)

    const response = await app.inject({
      method: "POST",
      url: "/v1/settings/agents/import/detect",
    })

    const body = InternalProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(502)
    expect(body.title).toBe("ACP registry unavailable")
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
    const { app: firstApp } = await createServer({
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
    const { app: secondApp } = await createServer({
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
