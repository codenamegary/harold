import { afterEach, describe, expect, test } from "bun:test"
import { WorkspaceActiveSessionsProblemSchema } from "contracts/http/error"
import { SessionCollectionSchema, CreateSessionResponseSchema,
  SessionSchema } from "contracts/http/session"
import {
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  enableAgent,
  seedWorkspace,
} from "../test-support/create-test-app"
import { WhichFn } from "../agent-settings/resolve-agent-path"

const resources = createTestAppResources()

afterEach(async () => {
  await cleanupTestAppResources(resources)
})

describe("DELETE /v1/workspaces/:id cascade", () => {
  test("closes live sessions and deletes workspace metadata", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "cascade-session",
      sessionLoadSessionId: "cascade-session",
    })
    const { workspaceId } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const createResponse = await app.inject({
      method: "POST",
      url: "/v1/sessions",
      payload: {
        workspaceId,
        agentId: "cursor",
        text: "Cascade session",
      },
    })
    const created = CreateSessionResponseSchema.parse(JSON.parse(createResponse.body))
    expect(createResponse.statusCode).toBe(201)

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}`,
    })
    expect(deleteResponse.statusCode).toBe(204)

    const listResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions?workspaceId=${workspaceId}`,
    })
    const listed = SessionCollectionSchema.parse(JSON.parse(listResponse.body))
    expect(listed.items).toHaveLength(0)

    const getWorkspaceResponse = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}`,
    })
    expect(getWorkspaceResponse.statusCode).toBe(404)

    const getSessionResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions/${created.id}`,
    })
    expect(getSessionResponse.statusCode).toBe(404)
  })

  test("returns 409 with forceDeleteAvailable when close fails, then succeeds with force=true", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app } = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true },
      sessionNewSessionId: "force-delete-session",
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
        text: "Force delete session",
      },
    })
    expect(createResponse.statusCode).toBe(201)

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}`,
    })
    const problem = WorkspaceActiveSessionsProblemSchema.parse(JSON.parse(deleteResponse.body))
    expect(deleteResponse.statusCode).toBe(409)
    expect(problem.forceDeleteAvailable).toBe(true)
    expect(problem.type).toBe("https://agent-server.local/problems/workspace-has-active-sessions")

    const forceDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}?force=true`,
    })
    expect(forceDeleteResponse.statusCode).toBe(204)

    const getWorkspaceResponse = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}`,
    })
    expect(getWorkspaceResponse.statusCode).toBe(404)
  })
})
