import { afterEach, describe, expect, test } from "bun:test"
import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  PROBLEM_TYPES,
  ValidationProblemSchema,
} from "contracts/http/error"
import {
  CancelSessionResponseSchema,
  CreateSessionResponseSchema,
  PromptSessionResponseSchema,
  SessionCollectionSchema,
  SessionSchema,
} from "contracts/http/session"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import {
  acceptTestExecutablePath,
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  enableAgent,
  seedBoundSession,
  seedWorkspace,
} from "../test-support/create-test-app"

const resources = createTestAppResources()

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

describe("POST /v1/sessions catalog create", () => {
  test("returns 201 with ACP catalog row", async () => {
    const dataDir = await createTempDataDir(resources)
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      sessionNewSessionId: "catalog-http-1",
    })
    await enableAgent(app, "cursor", whichFn)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { agentId: "cursor", cwd: "/tmp/project" },
    })
    const body = CreateSessionResponseSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(201)
    expect(body).toMatchObject({
      agentId: "cursor",
      sessionId: "catalog-http-1",
      cwd: "/tmp/project",
      title: "catalog-http-1",
    })
  })

  test("returns 404 for unknown agent id", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app } = await createTestApp(resources, dataDir)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { agentId: "unknown", cwd: "/tmp/project" },
    })
    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(404)
    expect(body.type).toBe(PROBLEM_TYPES.notFound)
  })

  test("returns 409 when agent is disabled", async () => {
    const dataDir = await createTempDataDir(resources)
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { agentId: "cursor", cwd: "/tmp/project" },
    })
    const body = ConflictProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(409)
    expect(body.type).toBe(PROBLEM_TYPES.conflict)
  })

  test("returns 400 for empty cwd", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app } = await createTestApp(resources, dataDir)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { agentId: "cursor", cwd: "" },
    })

    expect(response.statusCode).toBe(400)
    expect(() => ValidationProblemSchema.parse(JSON.parse(response.body))).not.toThrow()
  })
})

describe("legacy bound session HTTP", () => {
  test("get, rename, select, archive, and prompt/cancel", async () => {
    const dataDir = await createTempDataDir(resources)
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app, database, acpSupervisor } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "legacy-bound-1",
        emitSessionUpdatesOnPrompt: true,
      },
    )
    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const seeded = await seedBoundSession({
      database,
      acpSupervisor,
      workspaceId,
      workspacePath: workspaceDir,
      agentId: "cursor",
      name: "Legacy bound",
    })

    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions/${seeded.sessionId}`,
    })
    const session = SessionSchema.parse(JSON.parse(getResponse.body))
    expect(getResponse.statusCode).toBe(200)
    expect(session.name).toBe("Legacy bound")
    expect(session.state).toBe("idle")

    const renameResponse = await app.inject({
      method: "PATCH",
      url: `/v1/sessions/${seeded.sessionId}`,
      payload: { name: "Renamed" },
    })
    expect(renameResponse.statusCode).toBe(200)
    expect(SessionSchema.parse(JSON.parse(renameResponse.body)).name).toBe("Renamed")

    const selectResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${seeded.sessionId}/select`,
    })
    expect(selectResponse.statusCode).toBe(200)

    const promptResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${seeded.sessionId}/prompt`,
      payload: { text: "hello from http" },
    })
    expect(promptResponse.statusCode).toBe(202)
    expect(PromptSessionResponseSchema.parse(JSON.parse(promptResponse.body)).turnId).toMatch(
      /^turn_/,
    )

    await new Promise((resolve) => setTimeout(resolve, 80))

    const archiveResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${seeded.sessionId}/archive`,
    })
    expect(archiveResponse.statusCode).toBe(200)
    expect(SessionSchema.parse(JSON.parse(archiveResponse.body)).state).toBe("archived")
  })

  test("status reports activeSessions for live bindings", async () => {
    const dataDir = await createTempDataDir(resources)
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app, database, acpSupervisor } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      },
    )
    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)
    await seedBoundSession({
      database,
      acpSupervisor,
      workspaceId,
      workspacePath: workspaceDir,
      agentId: "cursor",
      name: "Status session",
    })

    expect(acpSupervisor.getStatus().activeSessions).toBe(1)
    expect(acpSupervisor.getStatus().state).toBe("ready")
  })

  test("GET /v1/sessions returns ACP catalog rows not SQLite ids", async () => {
    const dataDir = await createTempDataDir(resources)
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app, database, acpSupervisor } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "listed-acp-1",
      },
    )
    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)
    await seedBoundSession({
      database,
      acpSupervisor,
      workspaceId,
      workspacePath: workspaceDir,
      agentId: "cursor",
      name: "Listed",
    })

    const listResponse = await app.inject({ method: "GET", url: "/v1/sessions" })
    const listed = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(listResponse.statusCode).toBe(200)
    expect(listed.items).toEqual([
      expect.objectContaining({
        agentId: "cursor",
        sessionId: "listed-acp-1",
        cwd: workspaceDir,
      }),
    ])
  })

  test("cancel returns 202 while a turn is running", async () => {
    const dataDir = await createTempDataDir(resources)
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app, database, acpSupervisor } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        emitSessionUpdatesOnPrompt: true,
        promptCompletionDelayMs: 200,
      },
    )
    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)
    const seeded = await seedBoundSession({
      database,
      acpSupervisor,
      workspaceId,
      workspacePath: workspaceDir,
      agentId: "cursor",
      name: "Cancel api",
    })

    const promptResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${seeded.sessionId}/prompt`,
      payload: { text: "long turn" },
    })
    expect(promptResponse.statusCode).toBe(202)
    const turnId = PromptSessionResponseSchema.parse(JSON.parse(promptResponse.body)).turnId

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${seeded.sessionId}/cancel`,
      payload: {},
    })
    expect(cancelResponse.statusCode).toBe(202)
    expect(CancelSessionResponseSchema.parse(JSON.parse(cancelResponse.body)).turnId).toBe(turnId)
  })

  test("returns 404 for unknown session", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app } = await createTestApp(resources, dataDir)

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/sess_unknown",
    })
    expect(response.statusCode).toBe(404)
    expect(NotFoundProblemSchema.parse(JSON.parse(response.body)).type).toBe(PROBLEM_TYPES.notFound)
  })
})
