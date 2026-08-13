import { afterEach, describe, expect, test } from "bun:test"
import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  PROBLEM_TYPES,
} from "contracts/http/error"
import {
  CreateSessionResponseSchema,
  SessionCollectionSchema,
  deleteSessionPath,
} from "contracts/http/session"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import {
  acceptTestExecutablePath,
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  enableAgent,
} from "../test-support/create-test-app"

const resources = createTestAppResources()

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

describe("ACP catalog sessions HTTP", () => {
  test("POST /v1/sessions creates via session/new and GET lists ACP rows", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, acpSupervisor } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "catalog-created-1",
      },
    )
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        agentId: "cursor",
        cwd: "/tmp/catalog-project",
      },
    })

    expect(createResponse.statusCode).toBe(201)
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))
    expect(created).toMatchObject({
      agentId: "cursor",
      sessionId: "catalog-created-1",
      cwd: "/tmp/catalog-project",
      title: "catalog-created-1",
    })
    expect(acpSupervisor.getRunningAgentIds()).toEqual(["cursor"])

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions",
    })
    expect(listResponse.statusCode).toBe(200)
    const collection = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(collection.items).toEqual([
      {
        agentId: "cursor",
        sessionId: "catalog-created-1",
        cwd: "/tmp/catalog-project",
        title: "catalog-created-1",
        updatedAt: expect.any(String),
      },
    ])
  })

  test("GET /v1/sessions unions rows from two ready agents", async () => {
    const dataDir = await createTempDataDir(resources)
    const whichFn: WhichFn = (binaryName) => {
      if (binaryName === "agent") {
        return "/usr/local/bin/agent"
      }
      if (binaryName === "opencode") {
        return "/usr/local/bin/opencode"
      }
      return undefined
    }
    const { app, acpSupervisor } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: false, sessionClose: false, sessionList: true },
      },
    )
    await enableAgent(app, "cursor", whichFn)
    await enableAgent(app, "opencode", whichFn)

    await acpSupervisor.start("cursor")
    await acpSupervisor.start("opencode")

    const cursorCreate = await acpSupervisor.createSession({
      agentId: "cursor",
      cwd: "/tmp/cursor-ws",
    })
    const opencodeCreate = await acpSupervisor.createSession({
      agentId: "opencode",
      cwd: "/tmp/opencode-ws",
    })
    expect(cursorCreate.ok).toBe(true)
    expect(opencodeCreate.ok).toBe(true)

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions",
    })
    expect(listResponse.statusCode).toBe(200)
    const collection = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(collection.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentId: "cursor",
          cwd: "/tmp/cursor-ws",
        }),
        expect.objectContaining({
          agentId: "opencode",
          cwd: "/tmp/opencode-ws",
        }),
      ]),
    )
    expect(collection.items).toHaveLength(2)
  })

  test("DELETE /v1/sessions/:sessionId closes via session/close and drops the catalog row", async () => {
    const dataDir = await createTempDataDir(resources)
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "catalog-close-1",
      },
    )
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        agentId: "cursor",
        cwd: "/tmp/catalog-close",
      },
    })
    expect(createResponse.statusCode).toBe(201)
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: deleteSessionPath(created.sessionId, { agentId: "cursor" }),
    })
    expect(deleteResponse.statusCode).toBe(204)
    expect(deleteResponse.body).toBe("")

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions",
    })
    const collection = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(collection.items).toEqual([])
  })

  test("DELETE /v1/sessions/:sessionId returns 409 when the agent has no session/close", async () => {
    const dataDir = await createTempDataDir(resources)
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: false, sessionList: true },
        sessionNewSessionId: "catalog-close-unsupported",
      },
    )
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        agentId: "cursor",
        cwd: "/tmp/catalog-close",
      },
    })
    expect(createResponse.statusCode).toBe(201)
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: deleteSessionPath(created.sessionId, { agentId: "cursor" }),
    })
    const body = ConflictProblemSchema.parse(JSON.parse(deleteResponse.body))
    expect(deleteResponse.statusCode).toBe(409)
    expect(body.type).toBe(PROBLEM_TYPES.conflict)
    expect(body.detail).toBe("Agent does not support session/close")
  })

  test("DELETE /v1/sessions/:sessionId returns 404 for unknown agent id", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app } = await createTestApp(resources, dataDir)

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: deleteSessionPath("acp-1", { agentId: "unknown" }),
    })
    const body = NotFoundProblemSchema.parse(JSON.parse(deleteResponse.body))
    expect(deleteResponse.statusCode).toBe(404)
    expect(body.type).toBe(PROBLEM_TYPES.notFound)
  })
})
