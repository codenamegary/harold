import { afterEach, describe, expect, test } from "bun:test"
import { WorkspaceActiveSessionsProblemSchema } from "contracts/http/error"
import {
  cleanupTestAppResources,
  createTempDataDir,
  createTestApp,
  createTestAppResources,
  enableAgent,
  seedBoundSession,
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
    const { app, database, acpSupervisor } = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      sessionNewSessionId: "cascade-session",
      sessionLoadSessionId: "cascade-session",
    })
    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const { sessionId } = await seedBoundSession({
      database,
      acpSupervisor,
      workspaceId,
      workspacePath: workspaceDir,
      agentId: "cursor",
      name: "Cascade session",
    })

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}`,
    })
    expect(deleteResponse.statusCode).toBe(204)

    const getWorkspaceResponse = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}`,
    })
    expect(getWorkspaceResponse.statusCode).toBe(404)

    const getSessionResponse = await app.inject({
      method: "GET",
      url: `/v1/sessions/${sessionId}`,
    })
    expect(getSessionResponse.statusCode).toBe(404)
  })

  test("returns 409 with forceDeleteAvailable when close fails, then succeeds with force=true", async () => {
    const dataDir = await createTempDataDir(resources)
    const detectedPath = "/usr/local/bin/agent"
    const whichFn: WhichFn = (binaryName) =>
      binaryName === "agent" ? detectedPath : undefined
    const { app, database, acpSupervisor } = await createTestApp(resources, dataDir, whichFn, undefined, {
      capabilities: { loadSession: true, sessionClose: true, sessionList: true },
      sessionNewSessionId: "force-delete-session",
      sessionCloseFails: true,
    })
    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    await seedBoundSession({
      database,
      acpSupervisor,
      workspaceId,
      workspacePath: workspaceDir,
      agentId: "cursor",
      name: "Force delete session",
    })

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
