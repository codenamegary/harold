import { describe, expect, test } from "bun:test"
import { catalogAgentIds } from "core/agent-catalog/generated"
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
import { WhichFn } from "core/agent-settings/resolve-agent-path"
import {
  ValidateExecutablePathFn,
  validateExecutablePath,
} from "core/agent-settings/validate-agent-path"
import { FetchRegistryFn } from "core/agent-settings/ports"
import { spawnFakeAcp, SpawnFakeAcpOptions } from "test-support/spawn"
import { SpawnAgentProcessFn } from "../acp/supervisor/supervisor.ports"
import { acceptTestExecutablePath } from "../test-support/test.app"
import { bootTestApp } from "../test-support/test.harness"

const authHeaders = (app: { deviceCredential: { credential: string } }) => ({
  authorization: `Bearer ${app.deviceCredential.credential}`,
})

const defaultFakeAcpOptions: SpawnFakeAcpOptions = {
  capabilities: { loadSession: true, sessionClose: true, sessionList: true },
}

const spawnBaseFake = (options: SpawnFakeAcpOptions = defaultFakeAcpOptions) => {
  const fake = spawnFakeAcp(options)
  return {
    stdin: fake.stdin,
    stdout: fake.stdout,
    kill: () => {
      fake.kill()
    },
    waitForExit: () => fake.process.exited,
  }
}

type CreateTestAppParams = {
  whichFn?: WhichFn
  validateExecutablePathFn?: ValidateExecutablePathFn
  fetchRegistryFn?: FetchRegistryFn
  fakeAcpOptions?: SpawnFakeAcpOptions
  spawnAgentProcessFn?: SpawnAgentProcessFn
}

const createTestApp = (params: CreateTestAppParams = {}) =>
  bootTestApp({
    whichFn: params.whichFn,
    validateExecutablePathFn: params.validateExecutablePathFn,
    fetchRegistryFn: params.fetchRegistryFn,
    fakeAcpOptions: params.fakeAcpOptions ?? defaultFakeAcpOptions,
    spawnAgentProcessFn: params.spawnAgentProcessFn,
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

describe("GET /v1/settings/agents capabilities", () => {
  test("returns null capabilities for stopped agents", async () => {
    const { app } = await createTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/settings/agents",
    })
    const body = AgentSettingsCollectionSchema.parse(JSON.parse(response.body))
    const cursor = findAgent(body, "cursor")

    expect(response.statusCode).toBe(200)
    expect(cursor.capabilities).toBeNull()
  })

  test("returns live inventory when an agent is ready", async () => {
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app } = await createTestApp({ whichFn })

    await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/settings/agents",
    })
    const body = AgentSettingsCollectionSchema.parse(JSON.parse(response.body))
    const cursor = findAgent(body, "cursor")

    expect(cursor.state).toEqual({ status: "ready", error: null })
    expect(cursor.capabilities?.agentInfo).toEqual({ name: "fake-acp", version: "0.0.0" })
    const loadSession = cursor.capabilities?.entries.find((entry) => entry.path === "loadSession")
    expect(loadSession).toMatchObject({
      advertised: true,
      value: true,
      known: true,
      requiredBy: ["session/load"],
    })
  })

  test("returns null capabilities when respawn leaves the agent in error", async () => {
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) => (binaryName === "agent" ? detectedPath : undefined)
    const spawnCount = { value: 0 }
    const { app } = await createTestApp({
      whichFn,
      spawnAgentProcessFn: () => {
        spawnCount.value += 1
        if (spawnCount.value > 1) {
          throw new Error("spawn exploded")
        }
        return spawnBaseFake()
      },
    })

    await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })

    await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/settings/agents/cursor/actions",
      payload: { type: "respawn" },
    })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/settings/agents",
    })
    const cursor = findAgent(
      AgentSettingsCollectionSchema.parse(JSON.parse(response.body)),
      "cursor",
    )

    expect(cursor.state).toEqual({ status: "error", error: "spawn exploded" })
    expect(cursor.capabilities).toBeNull()
  })
})

describe("GET /v1/settings/agents", () => {
  test("returns all catalog agents disabled by default with presence and popular", async () => {
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app } = await createTestApp({ whichFn })

    const response = await app.inject({
      headers: authHeaders(app),
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
    const whichFn: WhichFn = (binaryName) => {
      if (binaryName === "agent") {
        return "/usr/local/bin/agent"
      }
      if (binaryName === "opencode") {
        return "/usr/local/bin/opencode"
      }
      return undefined
    }
    const { app } = await createTestApp({ whichFn })

    await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/opencode",
      payload: { enabled: true },
    })

    const response = await app.inject({
      headers: authHeaders(app),
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
        expect(previous.displayName.localeCompare(current.displayName)).toBeLessThanOrEqual(0)
      }
    }

    const firstPresentIndex = body.items.findIndex((item) => !item.enabled && item.present)
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
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) => (binaryName === "agent" ? detectedPath : undefined)
    const { app } = await createTestApp({ whichFn })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/settings/agents/cursor/detect-path",
    })

    const body = DetectAgentPathResponseSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.path).toBe(detectedPath)

    const listResponse = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/settings/agents",
    })
    const listBody = AgentSettingsCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(findAgent(listBody, "cursor").path).toBe("agent")
  })

  test("returns 404 when detect fails", async () => {
    const whichFn: WhichFn = () => undefined
    const { app } = await createTestApp({ whichFn })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/settings/agents/cursor/detect-path",
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(404)
    expect(body.title).toBe("Agent executable not found")
  })
})

describe("PATCH /v1/settings/agents/:agentId", () => {
  test("rejects enable after spawn when the agent omits session/list", async () => {
    const whichFn: WhichFn = () => undefined
    const { app } = await createTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: false },
      },
    })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/gemini",
      payload: { enabled: true, path: "/usr/local/bin/gemini" },
    })

    expect(response.statusCode).toBe(409)
    const problem = ConflictProblemSchema.parse(JSON.parse(response.body))
    expect(problem.detail).toContain("sessionCapabilities.list")

    const listed = await app.inject({
      headers: authHeaders(app),
      method: "GET",
      url: "/v1/settings/agents",
    })
    const gemini = findAgent(AgentSettingsCollectionSchema.parse(JSON.parse(listed.body)), "gemini")
    expect(gemini.enabled).toBe(false)
  })

  test("enables gemini when the agent advertises session/list", async () => {
    const whichFn: WhichFn = () => undefined
    const { app } = await createTestApp({ whichFn })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/gemini",
      payload: { enabled: true, path: "/usr/local/bin/gemini" },
    })

    const body = AgentSettingsSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body.enabled).toBe(true)
    expect(body.id).toBe("gemini")
  })

  test("enables cursor and auto-detects executable path", async () => {
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) => (binaryName === "agent" ? detectedPath : undefined)
    const { app } = await createTestApp({ whichFn })

    const response = await app.inject({
      headers: authHeaders(app),
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
    const whichFn: WhichFn = () => undefined
    const { app } = await createTestApp({ whichFn })

    const response = await app.inject({
      headers: authHeaders(app),
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
      headers: authHeaders(app),
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
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) => (binaryName === "agent" ? detectedPath : undefined)
    const { app } = await createTestApp({ whichFn })

    await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })

    const response = await app.inject({
      headers: authHeaders(app),
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
    const storedPath = "/opt/custom/agent"
    const whichFn: WhichFn = () => "/usr/local/bin/agent"
    const { app } = await createTestApp({ whichFn })

    await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: storedPath },
    })

    await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: false },
    })

    const response = await app.inject({
      headers: authHeaders(app),
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
    const storedPath = "/opt/custom/agent"
    const first = await createTestApp()

    await first.app.inject({
      headers: authHeaders(first.app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: storedPath },
    })

    await first.app.inject({
      headers: authHeaders(first.app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: false },
    })

    const second = await first.reopen({ validateExecutablePathFn: validateExecutablePath })

    const response = await second.app.inject({
      headers: authHeaders(second.app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.title).toBe("Invalid agent executable path")
  }, 15_000)

  test("sets path with manual override", async () => {
    const { app } = await createTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
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
    const { app } = await createTestApp({ validateExecutablePathFn: validateExecutablePath })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: "/does/not/exist" },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(body.title).toBe("Invalid agent executable path")
  })

  test("rejects null path override", async () => {
    const { app } = await createTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true, path: null },
    })

    expect(response.statusCode).toBe(400)
  })

  test("enables a non-cursor catalog agent with an explicit path", async () => {
    const detectedPath = "/usr/bin/npx"
    const whichFn: WhichFn = (binaryName) => (binaryName === "npx" ? detectedPath : undefined)
    const { app } = await createTestApp({ whichFn })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/claude-acp",
      payload: { enabled: true, path: detectedPath },
    })

    const body = AgentSettingsSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(200)
    expect(body).toMatchObject({
      id: "claude-acp",
      displayName: "Claude Agent",
      available: true,
      enabled: true,
      path: detectedPath,
      args: ["-y", "@agentclientprotocol/claude-agent-acp@0.66.0"],
      present: false,
      popular: true,
      deletable: false,
      state: { status: "ready", error: null },
    })
    expect(body.capabilities?.agentInfo).toEqual({ name: "fake-acp", version: "0.0.0" })
    expect(body.capabilities?.entries.length).toBeGreaterThan(0)
  })

  test("returns 404 for unknown agent id without a settings row", async () => {
    const { app } = await createTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
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

    const { app } = await createTestApp({ whichFn, fetchRegistryFn })

    const detectResponse = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/settings/agents/import/detect",
    })
    const detectBody = ImportDetectResponseSchema.parse(JSON.parse(detectResponse.body))

    expect(detectResponse.statusCode).toBe(200)
    expect(detectBody.items.map((item) => item.id).sort()).toEqual(["brand-new-agent", "cursor"])
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
            headers: authHeaders(app),
            method: "GET",
            url: "/v1/settings/agents",
          })
        ).body,
      ),
    )
    expect(listBeforeApply.items.some((item) => item.id === "brand-new-agent")).toBe(false)

    const applyResponse = await app.inject({
      headers: authHeaders(app),
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
      state: { status: "stopped", error: null },
      capabilities: null,
      authSummary: {
        status: "unknown",
        error: null,
        activeSessionId: null,
        canLogout: false,
      },
    })
    expect(applyBody.items[0]?.id).toBe("brand-new-agent")
  })

  test("detect returns 502 when registry fetch fails", async () => {
    const fetchRegistryFn: FetchRegistryFn = async () => {
      throw new Error("network down")
    }
    const { app } = await createTestApp({ fetchRegistryFn })

    const response = await app.inject({
      headers: authHeaders(app),
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
    const { app } = await createTestApp()

    const createResponse = await app.inject({
      headers: authHeaders(app),
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
      state: { status: "stopped", error: null },
      capabilities: null,
      authSummary: {
        status: "unknown",
        error: null,
        activeSessionId: null,
        canLogout: false,
      },
    })

    const secondResponse = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/settings/agents",
      payload: {},
    })
    const second = AgentSettingsSchema.parse(JSON.parse(secondResponse.body))
    expect(second.displayName).toBe("Custom Agent 1")
    expect(second.id).toBe("custom-custom-agent-1")

    const listResponse = await app.inject({
      headers: authHeaders(app),
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
    const { app } = await createTestApp()

    const createResponse = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/settings/agents",
      payload: {},
    })
    const created = AgentSettingsSchema.parse(JSON.parse(createResponse.body))

    const renameResponse = await app.inject({
      headers: authHeaders(app),
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
            headers: authHeaders(app),
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
    const { app } = await createTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { displayName: "Nope" },
    })

    expect(response.statusCode).toBe(409)
  })
})

describe("DELETE /v1/settings/agents/:agentId", () => {
  test("deletes custom agents and rejects catalog deletes", async () => {
    const { app } = await createTestApp()

    const created = AgentSettingsSchema.parse(
      JSON.parse(
        (
          await app.inject({
            headers: authHeaders(app),
            method: "POST",
            url: "/v1/settings/agents",
            payload: {},
          })
        ).body,
      ),
    )

    const deleteCustom = await app.inject({
      headers: authHeaders(app),
      method: "DELETE",
      url: `/v1/settings/agents/${created.id}`,
    })
    expect(deleteCustom.statusCode).toBe(204)

    const list = AgentSettingsCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            headers: authHeaders(app),
            method: "GET",
            url: "/v1/settings/agents",
          })
        ).body,
      ),
    )
    expect(list.items.some((item) => item.id === created.id)).toBe(false)

    const deleteCatalog = await app.inject({
      headers: authHeaders(app),
      method: "DELETE",
      url: "/v1/settings/agents/cursor",
    })
    expect(deleteCatalog.statusCode).toBe(409)
  })
})

describe("custom agent enable and spawn snapshot", () => {
  test(
    "enables custom agent with path and exposes spawn snapshot for supervisor",
    async () => {
      const customPath = "/opt/custom/acp-agent"
      const { app, database } = await createTestApp()

      const created = AgentSettingsSchema.parse(
        JSON.parse(
          (
            await app.inject({
              headers: authHeaders(app),
              method: "POST",
              url: "/v1/settings/agents",
              payload: {},
            })
          ).body,
        ),
      )

      const enableResponse = await app.inject({
        headers: authHeaders(app),
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

      const { assembleAgentSettingsSlice } = await import("./agent.settings.assembly")
      const agentSettings = assembleAgentSettingsSlice({
        database,
        validateExecutablePathFn: acceptTestExecutablePath,
        acpSupervisor: () => {
          throw new Error("supervisor not used in this test")
        },
        authBroker: () => {
          throw new Error("auth broker not used in this test")
        },
      })
      const snapshot = agentSettings.getSpawnSnapshot(created.id)
      expect(snapshot).toEqual({
        kind: "binary",
        binaryName: customPath,
        command: [customPath, "acp"],
        displayName: "Custom Agent",
        authMethodId: created.id,
      })
    },
    { timeout: 20_000 },
  )
})

describe("agent settings durability", () => {
  test("keeps settings across server restart", async () => {
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) => (binaryName === "agent" ? detectedPath : undefined)

    const first = await createTestApp({ whichFn })
    const enableResponse = await first.app.inject({
      headers: authHeaders(first.app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })
    expect(enableResponse.statusCode).toBe(200)

    const second = await first.reopen({ whichFn })
    const response = await second.app.inject({
      headers: authHeaders(second.app),
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

describe("PATCH /v1/settings/agents/:agentId enable failures", () => {
  test("returns the real ACP start reason when enable start fails", async () => {
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) => (binaryName === "agent" ? detectedPath : undefined)
    const { app } = await createTestApp({
      whichFn,
      spawnAgentProcessFn: () => {
        throw new Error("spawn exploded")
      },
    })

    const response = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })
    const problem = ConflictProblemSchema.parse(JSON.parse(response.body))
    const listed = AgentSettingsCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            headers: authHeaders(app),
            method: "GET",
            url: "/v1/settings/agents",
          })
        ).body,
      ),
    )
    const cursor = findAgent(listed, "cursor")

    expect(response.statusCode).toBe(409)
    expect(problem.detail).toBe("spawn exploded")
    expect(problem.detail).not.toBe("ACP supervisor failed to start")
    expect(cursor.enabled).toBe(false)
  })
})

describe("POST /v1/settings/agents/:agentId/actions", () => {
  test("respawns an enabled agent and leaves it enabled", async () => {
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) => (binaryName === "agent" ? detectedPath : undefined)
    const { app } = await createTestApp({ whichFn })

    const enableResponse = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })
    expect(enableResponse.statusCode).toBe(200)

    const response = await app.inject({
      headers: authHeaders(app),
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
    const { app } = await createTestApp()

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/settings/agents/cursor/actions",
      payload: { type: "respawn" },
    })
    const problem = ConflictProblemSchema.parse(JSON.parse(response.body))
    const listed = AgentSettingsCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            headers: authHeaders(app),
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
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) => (binaryName === "agent" ? detectedPath : undefined)
    const spawnCount = { value: 0 }
    const { app } = await createTestApp({
      whichFn,
      spawnAgentProcessFn: () => {
        spawnCount.value += 1
        if (spawnCount.value > 1) {
          throw new Error("spawn exploded")
        }
        return spawnBaseFake({
          capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        })
      },
    })

    const enableResponse = await app.inject({
      headers: authHeaders(app),
      method: "PATCH",
      url: "/v1/settings/agents/cursor",
      payload: { enabled: true },
    })
    expect(enableResponse.statusCode).toBe(200)

    const response = await app.inject({
      headers: authHeaders(app),
      method: "POST",
      url: "/v1/settings/agents/cursor/actions",
      payload: { type: "respawn" },
    })
    const problem = ConflictProblemSchema.parse(JSON.parse(response.body))
    const listed = AgentSettingsCollectionSchema.parse(
      JSON.parse(
        (
          await app.inject({
            headers: authHeaders(app),
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
