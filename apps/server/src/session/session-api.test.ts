import { describe, expect, test } from "bun:test"
import {
  ConflictProblemSchema,
  NotFoundProblemSchema,
  PROBLEM_TYPES,
  ValidationProblemSchema,
} from "contracts/http/error"
import { CreateSessionResponseSchema, SessionCollectionSchema } from "contracts/http/session"
import { WhichFn } from "../agent-settings/resolve-agent-path"
import { enableAgent, seedBoundSession, seedWorkspace } from "../test-support/test.app"
import { bootTestApp } from "../test-support/test.harness"

describe("POST /v1/sessions catalog create", () => {
  test("returns 201 with ACP catalog row and session config options", async () => {
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const configOptions = [
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "grok-4.5",
        options: [{ value: "grok-4.5", name: "Cursor Grok 4.5" }],
      },
    ]
    const { app } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "catalog-http-1",
        configOptions,
      },
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
    expect(body.configOptions).toEqual(configOptions)
  })

  test("returns 404 for unknown agent id", async () => {
    const { app } = await bootTestApp()

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
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app } = await bootTestApp({ whichFn })

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { agentId: "cursor", cwd: "/tmp/project" },
    })
    const body = ConflictProblemSchema.parse(JSON.parse(response.body))

    expect(response.statusCode).toBe(409)
    expect(body.type).toBe(PROBLEM_TYPES.conflict)
  })

  test("returns 409 with start failure detail when ACP spawn fails", async () => {
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app, acpSupervisor } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      },
    })
    await enableAgent(app, "cursor", whichFn)
    await acpSupervisor.stop()

    const originalStart = acpSupervisor.start.bind(acpSupervisor)
    acpSupervisor.start = async () => {
      throw new Error("spawn exploded: Bearer secret-token-value")
    }

    try {
      const response = await app.inject({
        method: "POST",
        url: "/v1/sessions",
        payload: { agentId: "cursor", cwd: "/tmp/project" },
      })
      const body = ConflictProblemSchema.parse(JSON.parse(response.body))

      expect(response.statusCode).toBe(409)
      expect(body.type).toBe(PROBLEM_TYPES.conflict)
      expect(body.title).toBe("ACP unavailable")
      expect(body.detail).toContain("spawn exploded")
      expect(body.detail).not.toContain("secret-token-value")
      expect(body.detail).toContain("[redacted]")
    } finally {
      acpSupervisor.start = originalStart
    }
  })

  test("returns 400 for empty cwd", async () => {
    const { app } = await bootTestApp()

    const response = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: { agentId: "cursor", cwd: "" },
    })

    expect(response.statusCode).toBe(400)
    expect(() => ValidationProblemSchema.parse(JSON.parse(response.body))).not.toThrow()
  })
})

describe("GET /v1/sessions catalog list", () => {
  test("status reports activeSessions for live bindings", async () => {
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app, acpSupervisor, dataDir } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      },
    })
    const { workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)
    await seedBoundSession({
      acpSupervisor,
      workspacePath: workspaceDir,
      agentId: "cursor",
    })

    expect(acpSupervisor.getStatus().activeSessions).toBe(1)
    expect(acpSupervisor.getStatus().state).toBe("ready")
  })

  test("GET /v1/sessions returns ACP catalog rows not SQLite ids", async () => {
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? "/usr/local/bin/agent" : undefined
    const { app, acpSupervisor, dataDir } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "listed-acp-1",
      },
    })
    const { workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)
    await seedBoundSession({
      acpSupervisor,
      workspacePath: workspaceDir,
      agentId: "cursor",
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
})
