import { afterEach, describe, expect, test } from "bun:test"
import { catalogAgentIds } from "../acp/catalog/generated/catalog.agents.generated"
import {
  ConflictProblemSchema,
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
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { ValidateExecutablePathFn, validateExecutablePath } from "../agent-settings/validate-agent-path"
import { FetchRegistryFn } from "../agent-settings/agent-settings-repository"
import { createServer } from "../bootstrap/server"
import { parseConfig } from "../config/config"
import { openDatabase } from "../persistence/database"
import { createRuntime } from "../runtime/runtime"
import {
  acceptTestExecutablePath,
  cleanupTestAppResources,
  createFakeSpawnFn,
  createTempDataDir as createTempDataDirWithResources,
  createTestAppResources,
} from "../test-support/create-test-app"

const resources = createTestAppResources()

const createTempDataDir = () => createTempDataDirWithResources(resources)

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
  const { spawnAgentProcessFn } = createFakeSpawnFn(resources, {
    capabilities: { loadSession: true, sessionClose: true, sessionList: true },
  })
  const { app, acpSupervisor } = await createServer({
    config,
    runtime,
    database,
    whichFn,
    validateExecutablePathFn,
    fetchRegistryFn,
    spawnAgentProcessFn,
  })
  resources.addApp(app)
  resources.addTeardown(async () => {
        await acpSupervisor.stop()
  })
  return { app, database, config }
}

afterEach(async () => {
  await cleanupTestAppResources(resources)
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
    expect(cursor.path).toBe("agent")
    expect(cursor.args).toEqual(["acp"])
    expect(cursor.present).toBe(true)
    expect(cursor.popular).toBe(true)
    expect(cursor.state).toEqual({ status: "stopped", error: null })

    const claudeAcp = findAgent(body, "claude-acp")
    expect(claudeAcp.enabled).toBe(false)
    expect(claudeAcp.available).toBe(true)
    expect(claudeAcp.path).toBe("npx")
    expect(claudeAcp.args).toEqual(["-y", "@agentclientprotocol/claude-agent-acp@0.66.0"])
    expect(claudeAcp.popular).toBe(true)
  })

  test("sorts enabled, then present, then popular, then rest", async () => {
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

    const bandRank = (item: (typeof body.items)[number]): number => {
      if (item.enabled) {
        return 0
      }
      if (item.present) {
        return 1
      }
      if (item.popular) {
        return 2
      }
      return 3
    }

    const ids = body.items.map((item) => item.id)
    expect(ids[0]).toBe("opencode")
    expect(body.items[0]?.enabled).toBe(true)

    for (let index = 1; index < body.items.length; index += 1) {
      const previous = body.items[index - 1]
      const current = body.items[index]
      if (previous === undefined || current === undefined) {
        throw new Error("Unexpected missing agent in sort band assertion")
      }
      const previousRank = bandRank(previous)
      const currentRank = bandRank(current)
      expect(currentRank).toBeGreaterThanOrEqual(previousRank)
      if (currentRank === previousRank) {
        expect(
          previous.displayName.localeCompare(current.displayName),
        ).toBeLessThanOrEqual(0)
      }
    }

    const firstPresentIndex = body.items.findIndex(
      (item) => !item.enabled && item.present,
    )
    const firstPopularOnlyIndex = body.items.findIndex(
      (item) => !item.enabled && !item.present && item.popular,
    )
    const firstRestIndex = body.items.findIndex(
      (item) => !item.enabled && !item.present && !item.popular,
    )

    expect(firstPresentIndex).toBeGreaterThan(0)
    expect(firstPopularOnlyIndex).toBeGreaterThan(firstPresentIndex)
    expect(firstRestIndex).toBeGreaterThan(firstPopularOnlyIndex)
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
    expect(findAgent(listBody, "cursor").path).toBe("agent")
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
  test("rejects enable for agents without session/list", async () => {
    const dataDir = await createTempDataDir()
    const whichFn: WhichFn = () => undefined
    const { app } = await createTestApp(dataDir, whichFn)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/gemini",
      payload: { enabled: true, path: "/usr/local/bin/gemini" },
    })

    expect(response.statusCode).toBe(409)
    const problem = ConflictProblemSchema.parse(JSON.parse(response.body))
    expect(problem.detail).toContain("sessionCapabilities.list")

    const listed = await app.inject({ method: "GET", url: "/v1/settings/agents" })
    const gemini = findAgent(
      AgentSettingsCollectionSchema.parse(JSON.parse(listed.body)),
      "gemini",
    )
    expect(gemini.enabled).toBe(false)
    expect(gemini.sessionListSupported).toBe(false)
  })

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
    expect(body.args).toEqual(["acp"])
    expect(body.present).toBe(true)
    expect(body.state).toEqual({ status: "ready", error: null })
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
    expect(cursor.path).toBe("agent")
    expect(cursor.args).toEqual(["acp"])
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
  }, 15_000)

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
      args: ["-y", "@agentclientprotocol/claude-agent-acp@0.66.0"],
      present: false,
      popular: true,
      deletable: false,
      sessionListSupported: true,
      state: { status: "ready", error: null },
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
      args: ["acp"],
      present: true,
      popular: false,
      deletable: true,
  sessionListSupported: true,
  state: { status: "stopped", error: null },
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

describe("POST /v1/settings/agents custom create", () => {
  test("creates a disabled custom agent at the top of the list", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/settings/agents",
      payload: {},
    })
    const created = AgentSettingsSchema.parse(JSON.parse(createResponse.body))

    expect(createResponse.statusCode).toBe(201)
    expect(created).toEqual({
      id: "custom-custom-agent",
      displayName: "Custom Agent",
      available: true,
      enabled: false,
      path: null,
      args: [],
      present: false,
      popular: false,
      deletable: true,
  sessionListSupported: true,
  state: { status: "stopped", error: null },
    })

    const secondResponse = await app.inject({
      method: "POST",
      url: "/v1/settings/agents",
      payload: {},
    })
    const second = AgentSettingsSchema.parse(JSON.parse(secondResponse.body))
    expect(second.displayName).toBe("Custom Agent 1")
    expect(second.id).toBe("custom-custom-agent-1")

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/settings/agents",
    })
    const list = AgentSettingsCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(list.items[0]?.id).toBe(second.id)
    expect(list.items[1]?.id).toBe(created.id)
  })
})

describe("PATCH /v1/settings/agents/:agentId rename custom", () => {
  test("renames display name and regenerates custom id", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/settings/agents",
      payload: {},
    })
    const created = AgentSettingsSchema.parse(JSON.parse(createResponse.body))

    const renameResponse = await app.inject({
      method: "PATCH",
      url: `/v1/settings/agents/${created.id}`,
      payload: { displayName: "My Bot" },
    })
    const renamed = AgentSettingsSchema.parse(JSON.parse(renameResponse.body))

    expect(renameResponse.statusCode).toBe(200)
    expect(renamed.id).toBe("custom-my-bot")
    expect(renamed.displayName).toBe("My Bot")

    const list = AgentSettingsCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "GET",
            url: "/v1/settings/agents",
          })
        ).body,
      ),
    )
    expect(list.items.some((item) => item.id === created.id)).toBe(false)
    expect(findAgent(list, "custom-my-bot").displayName).toBe("My Bot")
  })

  test("rejects rename for catalog agents", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { displayName: "Nope" },
    })

    expect(response.statusCode).toBe(409)
  })
})

describe("DELETE /v1/settings/agents/:agentId", () => {
  test("deletes custom agents and rejects catalog deletes", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const created = AgentSettingsSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/v1/settings/agents",
            payload: {},
          })
        ).body,
      ),
    )

    const deleteCustom = await app.inject({
      method: "DELETE",
      url: `/v1/settings/agents/${created.id}`,
    })
    expect(deleteCustom.statusCode).toBe(204)

    const list = AgentSettingsCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "GET",
            url: "/v1/settings/agents",
          })
        ).body,
      ),
    )
    expect(list.items.some((item) => item.id === created.id)).toBe(false)

    const deleteCatalog = await app.inject({
      method: "DELETE",
      url: "/v1/settings/agents/cursor",
    })
    expect(deleteCatalog.statusCode).toBe(409)
  })
})

describe("custom agent enable and spawn snapshot", () => {
  test("enables custom agent with path and exposes spawn snapshot for supervisor", async () => {
    const dataDir = await createTempDataDir()
    const customPath = "/opt/custom/acp-agent"
    const { app, database } = await createTestApp(dataDir)

    const created = AgentSettingsSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "POST",
            url: "/v1/settings/agents",
            payload: {},
          })
        ).body,
      ),
    )

    const enableResponse = await app.inject({
      method: "PATCH",
      url: `/v1/settings/agents/${created.id}`,
      payload: { enabled: true, path: customPath, args: ["acp"] },
    })
    const enabled = AgentSettingsSchema.parse(JSON.parse(enableResponse.body))

    expect(enableResponse.statusCode).toBe(200)
    expect(enabled.enabled).toBe(true)
    expect(enabled.path).toBe(customPath)
    expect(enabled.args).toEqual(["acp"])
    expect(enabled.present).toBe(true)

    const { createAgentSettingsRepository } = await import(
      "./agent-settings-repository"
    )
    const repository = createAgentSettingsRepository(database, {
      validateExecutablePathFn: acceptTestExecutablePath,
    })
    const snapshot = repository.getSpawnSnapshot(created.id)
    expect(snapshot).toEqual({
      kind: "binary",
      binaryName: customPath,
      command: [customPath, "acp"],
      displayName: "Custom Agent",
      authMethodId: created.id,
    })
  })
})

describe("agent settings durability", () => {
  test("keeps settings across server restart", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined

    const first = await createTestApp(dataDir, whichFn)
    const enableResponse = await first.app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })
    expect(enableResponse.statusCode).toBe(200)

    await first.app.close()
    first.database.close()

    const second = await createTestApp(dataDir, whichFn)
    const response = await second.app.inject({
      method: "GET",
      url: "/v1/settings/agents",
    })
    const body = AgentSettingsCollectionSchema.parse(JSON.parse(response.body))
    const cursor = findAgent(body, "cursor")

    expect(cursor.enabled).toBe(true)
    expect(cursor.path).toBe(detectedPath)
    expect(cursor.args).toEqual(["acp"])
  })
})

describe("POST /v1/settings/agents/:agentId/actions", () => {
  test("respawns an enabled agent and leaves it enabled", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(dataDir, whichFn)

    const enableResponse = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })
    expect(enableResponse.statusCode).toBe(200)

    const response = await app.inject({
      method: "POST",
      url: "/v1/settings/agents/cursor/actions",
      payload: { type: "respawn" },
    })
    const body = AgentSettingsSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.enabled).toBe(true)
    expect(body.state).toEqual({ status: "ready", error: null })
  })

  test("rejects respawn when the agent is disabled", async () => {
    const dataDir = await createTempDataDir()
    const { app } = await createTestApp(dataDir)

    const response = await app.inject({
      method: "POST",
      url: "/v1/settings/agents/cursor/actions",
      payload: { type: "respawn" },
    })
    const problem = ConflictProblemSchema.parse(JSON.parse(response.body))
    const listed = AgentSettingsCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "GET",
            url: "/v1/settings/agents",
          })
        ).body,
      ),
    )
    const cursor = findAgent(listed, "cursor")

    expect(response.statusCode).toBe(409)
    expect(problem.detail).toBe("Agent is not enabled")
    expect(cursor.enabled).toBe(false)
    expect(cursor.state).toEqual({ status: "stopped", error: null })
  })

  test("keeps the agent enabled when respawn start fails", async () => {
    const dataDir = await createTempDataDir()
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { spawnAgentProcessFn } = createFakeSpawnFn(resources, {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
    })
    const spawnCount = { value: 0 }
    const config = parseConfig({
      AGENT_SERVER_HOST: "127.0.0.1",
      AGENT_SERVER_PORT: "0",
      AGENT_SERVER_DATA_DIR: dataDir,
    })
    const database = openDatabase({ dataDir: config.dataDir })
    const { app, acpSupervisor } = await createServer({
      config,
      runtime: createRuntime("0.1.0"),
      database,
      whichFn,
      validateExecutablePathFn: acceptTestExecutablePath,
      spawnAgentProcessFn: () => {
        spawnCount.value += 1
        if (spawnCount.value > 1) {
          throw new Error("spawn exploded")
        }
        return spawnAgentProcessFn()
      },
    })
    resources.addApp(app)
    resources.addTeardown(async () => {
      await acpSupervisor.stop()
      database.close()
    })

    const enableResponse = await app.inject({
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })
    expect(enableResponse.statusCode).toBe(200)

    const response = await app.inject({
      method: "POST",
      url: "/v1/settings/agents/cursor/actions",
      payload: { type: "respawn" },
    })
    const problem = ConflictProblemSchema.parse(JSON.parse(response.body))
    const listed = AgentSettingsCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            method: "GET",
            url: "/v1/settings/agents",
          })
        ).body,
      ),
    )
    const cursor = findAgent(listed, "cursor")

    expect(response.statusCode).toBe(409)
    expect(problem.detail).toBe("spawn exploded")
    expect(cursor.enabled).toBe(true)
    expect(cursor.state).toEqual({
      status: "error",
      error: "spawn exploded",
    })
  })
})
