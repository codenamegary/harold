import { afterEach, describe, expect, test } from "bun:test"
import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  ValidationProblemSchema,
} from "contracts/http/error"
import {
  PromptSessionResponseSchema,
  SessionCollectionSchema,
  SessionSchema,
} from "contracts/http/session"
import { StatusSchema } from "contracts/http/status"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { buildAcpUnavailableProblem } from "./session-problems"
import {
  acceptTestExecutablePath,
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  enableAgent,
  seedWorkspace,
} from "../test-support/create-test-app"

const resources = createTestAppResources()

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

describe("POST /v1/sessions", () => {
  test("returns 201 with SessionSchema when workspace and agent are valid", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    await enableAgent(app, "cursor", whichFn)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Debug auth",
      },
    })

    const body = SessionSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(201)
    expect(body.workspaceId).toBe(workspaceId)
    expect(body.agentId).toBe("cursor")
    expect(body.name).toBe("Debug auth")
    expect(body.state).toBe("idle")
    expect(body.id).toMatch(/^sess_[0-9A-HJKMNP-TV-Z]{26}$/)
    expect("acpSessionId" in body).toBe(false)
  })

  test("returns 400 for invalid agent id", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app } = await createTestApp(resources, dataDir)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "unknown",
        name: "Debug auth",
      },
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(400)
    expect(response.headers["content-type"]).toStartWith("application/problem+json")
    expect(body.errors[0]?.pointer).toBe("#/agentId")
  })

  test("returns 404 for unknown workspace", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn)

    await enableAgent(app, "cursor", whichFn)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId: "ws_01J0000000000000000000000",
        agentId: "cursor",
        name: "Debug auth",
      },
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(404)
    expect(body.title).toBe("Workspace not found")
  })

  test("returns 409 when agent is unavailable", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app } = await createTestApp(resources, dataDir)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "claude",
        name: "Claude session",
      },
    })

    const body = ConflictProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(409)
    expect(body.title).toBe("Agent is not available")
  })

  test("returns 409 when agent is disabled", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app } = await createTestApp(resources, dataDir)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Debug auth",
      },
    })

    const body = ConflictProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(409)
    expect(body.title).toBe("Agent is disabled")
  })

  test("returns 400 for empty name", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    await enableAgent(app, "cursor", whichFn)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "",
      },
    })

    expect(response.statusCode).toBe(400)
    ValidationProblemSchema.parse(JSON.parse(response.body))
  })

  test("sanitizes protocol error detail in API problem responses", () => {
    const secret = "sk_live_super_secret_token_abcdefghijklmnopqrstuvwxyz"
    const problem = buildAcpUnavailableProblem(`session/load failed: Bearer ${secret}`)

    expect(problem.detail ?? "").not.toContain(secret)
    expect(problem.detail).toContain("[redacted]")
  })
})

describe("session lifecycle", () => {
  test("create, list, get, rename, select, archive, and resume conflicts", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "lifecycle-session",
      sessionLoadSessionId: "lifecycle-session",
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const workspaceBefore = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}`,
    })
    const workspaceBeforeBody = JSON.parse(workspaceBefore.body) as { lastUsedAt: string }

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Lifecycle session",
      },
    })
    const created = SessionSchema.parse(JSON.parse(createResponse.body))
    expect(createResponse.statusCode).toBe(201)
    expect(created.state).toBe("idle")

    const listResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions?workspaceId=${workspaceId}`,
    })
    const listed = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(listResponse.statusCode).toBe(200)
    expect(listed.items).toHaveLength(1)
    expect(listed.items[0]?.id).toBe(created.id)

    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions/${created.id}`,
    })
    const fetched = SessionSchema.parse(JSON.parse(getResponse.body))
    expect(getResponse.statusCode).toBe(200)
    expect(fetched.name).toBe("Lifecycle session")

    const renameResponse = await app.inject({
      method: "PATCH",
      url: `/v1/sessions/${created.id}`,
      payload: { name: "Renamed session" },
    })
    const renamed = SessionSchema.parse(JSON.parse(renameResponse.body))
    expect(renameResponse.statusCode).toBe(200)
    expect(renamed.name).toBe("Renamed session")

    const selectResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/select`,
    })
    const selected = SessionSchema.parse(JSON.parse(selectResponse.body))
    expect(selectResponse.statusCode).toBe(200)
    expect(selected.lastUsedAt).not.toBe(created.lastUsedAt)

    const workspaceAfterSelect = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}`,
    })
    const workspaceAfterSelectBody = JSON.parse(workspaceAfterSelect.body) as { lastUsedAt: string }
    expect(workspaceAfterSelectBody.lastUsedAt).toBe(selected.lastUsedAt)
    expect(workspaceAfterSelectBody.lastUsedAt).not.toBe(workspaceBeforeBody.lastUsedAt)

    const archiveResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/archive`,
    })
    const archived = SessionSchema.parse(JSON.parse(archiveResponse.body))
    expect(archiveResponse.statusCode).toBe(200)
    expect(archived.state).toBe("archived")
    expect(archived.archivedAt).not.toBeNull()

    const archiveAgainResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/archive`,
    })
    const archiveAgainBody = ConflictProblemSchema.parse(JSON.parse(archiveAgainResponse.body))
    expect(archiveAgainResponse.statusCode).toBe(409)
    expect(archiveAgainBody.title).toBe("Session is archived")

    const resumeArchivedResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/resume`,
    })
    const resumeArchivedBody = ConflictProblemSchema.parse(JSON.parse(resumeArchivedResponse.body))
    expect(resumeArchivedResponse.statusCode).toBe(409)
    expect(resumeArchivedBody.title).toBe("Session is archived")
  })

  test("resume returns idle session when loadSession is supported", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: true, sessionClose: false },
      sessionNewSessionId: "resumable-session",
      sessionLoadSessionId: "resumable-session",
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Resumable",
      },
    })
    const created = SessionSchema.parse(JSON.parse(createResponse.body))

    const resumeResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/resume`,
    })
    const resumed = SessionSchema.parse(JSON.parse(resumeResponse.body))
    expect(resumeResponse.statusCode).toBe(200)
    expect(resumed.state).toBe("idle")
  })

  test("resume returns 409 when agent does not support loadSession and metadata stays intact", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: false, sessionClose: false },
      sessionNewSessionId: "non-resumable-session",
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Non-resumable",
      },
    })
    const created = SessionSchema.parse(JSON.parse(createResponse.body))

    const resumeResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/resume`,
    })
    const body = ConflictProblemSchema.parse(JSON.parse(resumeResponse.body))
    expect(resumeResponse.statusCode).toBe(409)
    expect(body.title).toBe("Session is not resumable")

    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions/${created.id}`,
    })
    const persisted = SessionSchema.parse(JSON.parse(getResponse.body))
    expect(getResponse.statusCode).toBe(200)
    expect(persisted.id).toBe(created.id)
    expect(persisted.name).toBe("Non-resumable")
    expect(persisted.state).toBe("idle")
  })

  test("resume returns 409 when session/load fails and metadata stays intact", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: true, sessionClose: false },
      sessionNewSessionId: "load-fail-session",
      sessionLoadSessionId: "load-fail-session-loaded",
      sessionLoadFails: true,
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Load fail",
      },
    })
    const created = SessionSchema.parse(JSON.parse(createResponse.body))

    const resumeResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/resume`,
    })
    const body = ConflictProblemSchema.parse(JSON.parse(resumeResponse.body))
    expect(resumeResponse.statusCode).toBe(409)
    expect(body.title).toBe("Session is not resumable")
    expect(body.detail).toContain("session load failed")

    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions/${created.id}`,
    })
    const persisted = SessionSchema.parse(JSON.parse(getResponse.body))
    expect(getResponse.statusCode).toBe(200)
    expect(persisted.id).toBe(created.id)
    expect(persisted.name).toBe("Load fail")
    expect(persisted.state).toBe("idle")
  })

  test("status reports activeSessions for live bindings", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, config } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: false, sessionClose: false },
      sessionNewSessionId: "active-session",
    })
    await app.listen({ host: config.host, port: config.port })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const statusBefore = StatusSchema.parse(JSON.parse((await app.inject({
      method: "GET",
      url: "/v1/status",
    })).body))
    expect(statusBefore.acp.activeSessions).toBe(0)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Active binding",
      },
    })
    const created = SessionSchema.parse(JSON.parse(createResponse.body))
    expect(createResponse.statusCode).toBe(201)

    const statusAfterCreate = StatusSchema.parse(JSON.parse((await app.inject({
      method: "GET",
      url: "/v1/status",
    })).body))
    expect(statusAfterCreate.acp.activeSessions).toBe(1)

    const archiveResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/archive`,
    })
    expect(archiveResponse.statusCode).toBe(200)

    const statusAfterArchive = StatusSchema.parse(JSON.parse((await app.inject({
      method: "GET",
      url: "/v1/status",
    })).body))
    expect(statusAfterArchive.acp.activeSessions).toBe(0)
  })

  test("archive succeeds when agent advertises session/close", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: false, sessionClose: true },
      sessionNewSessionId: "close-on-archive-session",
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Close on archive",
      },
    })
    const created = SessionSchema.parse(JSON.parse(createResponse.body))
    expect(createResponse.statusCode).toBe(201)

    const archiveResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/archive`,
    })
    const archived = SessionSchema.parse(JSON.parse(archiveResponse.body))
    expect(archiveResponse.statusCode).toBe(200)
    expect(archived.state).toBe("archived")
  })

  test("archive returns 409 when session/close fails", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: false, sessionClose: true },
      sessionNewSessionId: "close-fail-session",
      sessionCloseFails: true,
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Close fail",
      },
    })
    const created = SessionSchema.parse(JSON.parse(createResponse.body))

    const archiveResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/archive`,
    })
    expect(archiveResponse.statusCode).toBe(409)
    ConflictProblemSchema.parse(JSON.parse(archiveResponse.body))

    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions/${created.id}`,
    })
    const persisted = SessionSchema.parse(JSON.parse(getResponse.body))
    expect(persisted.state).toBe("idle")
  })

  test("archive skips session/close when agent does not advertise close", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: false, sessionClose: false },
      sessionNewSessionId: "metadata-archive-session",
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        name: "Metadata archive",
      },
    })
    const created = SessionSchema.parse(JSON.parse(createResponse.body))

    const archiveResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/archive`,
    })
    const archived = SessionSchema.parse(JSON.parse(archiveResponse.body))
    expect(archiveResponse.statusCode).toBe(200)
    expect(archived.state).toBe("archived")
  })

  test("returns 404 for unknown session", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app } = await createTestApp(resources, dataDir)

    const response = await app.inject({
      method: "GET",
      url: "/v1/sessions/sess_01J0000000000000000000000",
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(404)
    expect(body.title).toBe("Session not found")
  })

  test("returns 400 for invalid list cursor", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    const response = await app.inject({
      method: "GET",
      url: `/v1/sessions?workspaceId=${workspaceId}&cursor=not-a-cursor`,
    })

    const body = ValidationProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(400)
    expect(body.errors[0]?.pointer).toBe("#/cursor")
  })
})

describe("POST /v1/sessions/:sessionId/prompt", () => {
  const waitFor = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 5000) => {
    const startedAt = Date.now()
    while (!(await predicate())) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error("timed out waiting for condition")
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  test("returns 202 with turnId and leaves session idle after turn completes", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "fake-session-prompt-api",
      sessionLoadSessionId: "fake-session-prompt-api",
      emitSessionUpdatesOnPrompt: true,
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", name: "Prompt api" },
    })
    const session = SessionSchema.parse(JSON.parse(created.body))

    const response = await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/prompt`,
      payload: { text: "hello from http" },
    })

    expect(response.statusCode).toBe(202)
    const body = PromptSessionResponseSchema.parse(JSON.parse(response.body))
    expect(body.turnId).toMatch(/^turn_[0-9A-HJKMNP-TV-Z]{26}$/)

    const running = await app.inject({
      method: "GET",
      url: `/v1/sessions/${session.id}`,
    })
    expect(SessionSchema.parse(JSON.parse(running.body)).state).toBe("running")

    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
    })
  })

  test("returns 409 when a turn is already running", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "fake-session-prompt-busy",
      sessionLoadSessionId: "fake-session-prompt-busy",
      emitSessionUpdatesOnPrompt: true,
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", name: "Busy prompt" },
    })
    const session = SessionSchema.parse(JSON.parse(created.body))

    const first = await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/prompt`,
      payload: { text: "first" },
    })
    expect(first.statusCode).toBe(202)

    const second = await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/prompt`,
      payload: { text: "second" },
    })
    const body = ConflictProblemSchema.parse(JSON.parse(second.body))
    expect(second.statusCode).toBe(409)
    expect(body.title).toBe("Turn already in progress")
  })

  test("returns 409 for archived sessions", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn)
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", name: "Archive prompt" },
    })
    const session = SessionSchema.parse(JSON.parse(created.body))

    await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/archive`,
    })

    const response = await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/prompt`,
      payload: { text: "too late" },
    })
    const body = ConflictProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(409)
    expect(body.title).toBe("Session is archived")
  })

  test("returns 409 for unbound sessions", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, acpSupervisor } = await createTestApp(resources, dataDir, whichFn)
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", name: "Unbound prompt" },
    })
    const session = SessionSchema.parse(JSON.parse(created.body))

    const binding = acpSupervisor
      .getSessionBindingRegistry()
      .getBinding("fake-session-new")
    expect(binding).toBeDefined()
    if (binding !== undefined) {
      acpSupervisor.getSessionBindingRegistry().unbind({
        acpSessionId: binding.acpSessionId,
      })
    }

    const response = await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/prompt`,
      payload: { text: "no binding" },
    })
    const body = ConflictProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(409)
    expect(body.title).toBe("ACP unavailable")
  })
})
