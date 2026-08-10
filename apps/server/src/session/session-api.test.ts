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
import { StatusSchema } from "contracts/http/status"
import { eq } from "drizzle-orm"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { sessions } from "../persistence/schema/sessions"
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

describe("custom ACP agent sessions", () => {
  test("creates a session with an enabled custom agent via fake ACP", async () => {
    const dataDir = await createTempDataDir(resources)
    const customPath = "/opt/custom/acp-agent"
    const whichFn: WhichFn = () => undefined
    const { app, database } = await createTestApp(
      resources,
      dataDir,
      whichFn,
      acceptTestExecutablePath,
      {
        capabilities: { loadSession: true, sessionClose: true },
        sessionNewSessionId: "custom-agent-session",
        sessionLoadSessionId: "custom-agent-session",
      },
    )
    const { workspaceId } = await seedWorkspace(app, dataDir)

    const createAgentResponse = await app.inject({
      method: "POST",
      url: "/v1/settings/agents",
      payload: {},
    })
    expect(createAgentResponse.statusCode).toBe(201)
    const createdAgent = JSON.parse(createAgentResponse.body) as { id: string }

    const enableResponse = await app.inject({
      method: "PATCH",
      url: `/v1/settings/agents/${createdAgent.id}`,
      payload: { enabled: true, path: customPath, args: ["acp"] },
    })
    expect(enableResponse.statusCode).toBe(200)

    const createSessionResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: createdAgent.id,
        text: "Custom agent session",
      },
    })
    const created = CreateSessionResponseSchema.parse(JSON.parse(createSessionResponse.body))
    expect(createSessionResponse.statusCode).toBe(201)
    expect(created.agentId).toBe(createdAgent.id)
    expect(created.state).toBe("running")

    const renameResponse = await app.inject({
      method: "PATCH",
      url: `/v1/settings/agents/${createdAgent.id}`,
      payload: { displayName: "My Custom Bot" },
    })
    expect(renameResponse.statusCode).toBe(200)
    const renamedAgent = JSON.parse(renameResponse.body) as { id: string }
    expect(renamedAgent.id).toBe("custom-my-custom-bot")

    const sessionRow = database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, created.id))
      .get()
    expect(sessionRow?.agentId).toBe("custom-my-custom-bot")
  })
})

describe("GET /v1/sessions", () => {
  test("returns non-archived sessions across workspaces sorted by lastUsedAt when workspaceId is omitted", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "global-list-session",
      sessionLoadSessionId: "global-list-session",
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createFirst = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        text: "First session",
      },
    })
    const first = CreateSessionResponseSchema.parse(JSON.parse(createFirst.body))

    const createSecond = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        text: "Second session",
      },
    })
    const second = CreateSessionResponseSchema.parse(JSON.parse(createSecond.body))

    await app.inject({
      method: "POST",
      url: `/v1/sessions/${first.id}/select`,
    })

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/sessions",
    })
    const listed = SessionCollectionSchema.parse(JSON.parse(listResponse.body))

    expect(listResponse.statusCode).toBe(200)
    expect(listed.items.map((session) => session.id)).toEqual([first.id, second.id])
  })
})

describe("POST /v1/sessions", () => {
  test("returns 201 with session fields plus turnId and derived name", async () => {
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
        text: "Debug auth",
      },
    })

    const body = CreateSessionResponseSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(201)
    expect(body.workspaceId).toBe(workspaceId)
    expect(body.agentId).toBe("cursor")
    expect(body.name).toBe("Debug auth")
    expect(body.state).toBe("running")
    expect(body.turnId).toMatch(/^turn_[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(body.id).toMatch(/^sess_[0-9A-HJKMNP-TV-Z]{26}$/)
    expect("acpSessionId" in body).toBe(false)
  })

  test("returns 404 for unknown agent id", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app } = await createTestApp(resources, dataDir)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "unknown",
        text: "Debug auth",
      },
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(404)
    expect(response.headers["content-type"]).toStartWith("application/problem+json")
    expect(body.title).toBe("Agent not found")
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
        text: "Debug auth",
      },
    })

    const body = NotFoundProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(404)
    expect(body.title).toBe("Workspace not found")
  })

  test("returns 409 when catalog agent is disabled", async () => {
    const dataDir = await createTempDataDir(resources)
    const { app } = await createTestApp(resources, dataDir)
    const { workspaceId } = await seedWorkspace(app, dataDir)

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "claude-acp",
        text: "Claude session",
      },
    })

    const body = ConflictProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(409)
    expect(body.title).toBe("Agent is disabled")
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
        text: "Debug auth",
      },
    })

    const body = ConflictProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(409)
    expect(body.title).toBe("Agent is disabled")
  })

  test("returns 400 for empty text", async () => {
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
        text: "",
      },
    })

    expect(response.statusCode).toBe(400)
    ValidationProblemSchema.parse(JSON.parse(response.body))
  })

  test("returns 400 when client sends name", async () => {
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
        text: "Debug auth",
        name: "Client name",
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
  const waitFor = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 5000) => {
    const startedAt = Date.now()
    while (!(await predicate())) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error("timed out waiting for condition")
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  const waitForSessionIdle = async (
    app: { inject: (opts: { method: string; url: string }) => Promise<{ body: string }> },
    sessionId: string,
  ) => {
    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${sessionId}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
    })
  }

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
        text: "Lifecycle session",
      },
    })
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))
    expect(createResponse.statusCode).toBe(201)
    expect(created.state).toBe("running")
    expect(created.turnId).toMatch(/^turn_[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(created.name).toBe("Lifecycle session")

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
    const { app, acpSupervisor } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
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
        text: "Resumable",
      },
    })
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))
    await waitForSessionIdle(app, created.id)

    const live = acpSupervisor.getSessionBindingRegistry().getBinding("resumable-session")
    expect(live).toBeDefined()
    if (live !== undefined) {
      acpSupervisor.getSessionBindingRegistry().unbind({
        acpSessionId: live.acpSessionId,
      })
    }

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
        text: "Non-resumable",
      },
    })
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))

    await waitForSessionIdle(app, created.id)

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

  test("resume returns 409 when session/load fails, marks error, and keeps metadata", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, acpSupervisor, database } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
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
        text: "Load fail",
      },
    })
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))

    await waitForSessionIdle(app, created.id)

    const live = acpSupervisor.getSessionBindingRegistry().getBinding("load-fail-session")
    expect(live).toBeDefined()
    if (live !== undefined) {
      acpSupervisor.getSessionBindingRegistry().unbind({
        acpSessionId: live.acpSessionId,
      })
    }

    const resumeResponse = await app.inject({
      method: "POST",
      url: `/v1/sessions/${created.id}/resume`,
    })
    const body = ConflictProblemSchema.parse(JSON.parse(resumeResponse.body))
    expect(resumeResponse.statusCode).toBe(409)
    expect(body.title).toBe("Session is not resumable")
    expect(body.type).toBe(PROBLEM_TYPES.conflict)
    expect(body.detail).toBe("Cursor could not load this session. Start a new session.")
    expect(body.detail).not.toBe("Invalid params")
    expect(body.detail).not.toContain("Invalid params")

    const getResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions/${created.id}`,
    })
    const persisted = SessionSchema.parse(JSON.parse(getResponse.body))
    expect(getResponse.statusCode).toBe(200)
    expect(persisted.id).toBe(created.id)
    expect(persisted.name).toBe("Load fail")
    expect(persisted.state).toBe("error")

    const row = database.db.select().from(sessions).where(eq(sessions.id, created.id)).get()
    expect(row?.resumable).toBe(false)
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
        text: "Active binding",
      },
    })
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))
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
        text: "Close on archive",
      },
    })
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))
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
        text: "Close fail",
      },
    })
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))

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
        text: "Metadata archive",
      },
    })
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))

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
      payload: { workspaceId, agentId: "cursor", text: "Prompt api" },
    })
    const session = CreateSessionResponseSchema.parse(JSON.parse(created.body))

    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
    })

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
      payload: { workspaceId, agentId: "cursor", text: "Busy prompt" },
    })
    const session = CreateSessionResponseSchema.parse(JSON.parse(created.body))
    expect(session.state).toBe("running")

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
      payload: { workspaceId, agentId: "cursor", text: "Archive prompt" },
    })
    const session = CreateSessionResponseSchema.parse(JSON.parse(created.body))

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

  test("returns 409 for unbound non-resumable sessions", async () => {
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
        capabilities: { loadSession: false, sessionClose: false },
        sessionNewSessionId: "fake-session-unbound",
      },
    )
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", text: "Unbound prompt" },
    })
    const session = CreateSessionResponseSchema.parse(JSON.parse(created.body))

    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
    })

    const binding = acpSupervisor
      .getSessionBindingRegistry()
      .getBinding("fake-session-unbound")
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

describe("POST /v1/sessions/:sessionId/cancel", () => {
  const waitFor = async (predicate: () => boolean | Promise<boolean>, timeoutMs = 5000) => {
    const startedAt = Date.now()
    while (!(await predicate())) {
      if (Date.now() - startedAt > timeoutMs) {
        throw new Error("timed out waiting for condition")
      }
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }

  test("returns 202 with turnId while a turn is running", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "fake-session-cancel-api",
      sessionLoadSessionId: "fake-session-cancel-api",
      emitSessionUpdatesOnPrompt: true,
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", text: "Cancel api" },
    })
    const session = CreateSessionResponseSchema.parse(JSON.parse(created.body))
    expect(session.state).toBe("running")

    const cancel = await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/cancel`,
    })
    expect(cancel.statusCode).toBe(202)
    const cancelBody = CancelSessionResponseSchema.parse(JSON.parse(cancel.body))
    expect(cancelBody.turnId).toBe(session.turnId)

    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
    })
  })

  test("returns 409 when no turn is in progress", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "fake-session-cancel-idle",
      sessionLoadSessionId: "fake-session-cancel-idle",
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", text: "Cancel idle" },
    })
    const session = CreateSessionResponseSchema.parse(JSON.parse(created.body))

    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
    })

    const response = await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/cancel`,
    })
    const body = ConflictProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(409)
    expect(body.title).toBe("No turn in progress")
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
      payload: { workspaceId, agentId: "cursor", text: "Archive cancel" },
    })
    const session = CreateSessionResponseSchema.parse(JSON.parse(created.body))

    await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/archive`,
    })

    const response = await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/cancel`,
    })
    const body = ConflictProblemSchema.parse(JSON.parse(response.body))
    expect(response.statusCode).toBe(409)
    expect(body.title).toBe("Session is archived")
  })

  test("re-notifies and returns the same turnId on a second cancel", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, acceptTestExecutablePath, {
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "fake-session-cancel-twice",
      sessionLoadSessionId: "fake-session-cancel-twice",
      emitSessionUpdatesOnPrompt: true,
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const created = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { workspaceId, agentId: "cursor", text: "Cancel twice" },
    })
    const session = CreateSessionResponseSchema.parse(JSON.parse(created.body))
    expect(session.state).toBe("running")

    const firstCancel = await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/cancel`,
    })
    expect(firstCancel.statusCode).toBe(202)

    const secondCancel = await app.inject({
      method: "POST",
      url: `/v1/sessions/${session.id}/cancel`,
    })
    expect(secondCancel.statusCode).toBe(202)
    const secondBody = CancelSessionResponseSchema.parse(JSON.parse(secondCancel.body))
    expect(secondBody.turnId).toBe(session.turnId)

    await waitFor(async () => {
      const latest = await app.inject({
        method: "GET",
        url: `/v1/sessions/${session.id}`,
      })
      return SessionSchema.parse(JSON.parse(latest.body)).state === "idle"
    })
  })
})
