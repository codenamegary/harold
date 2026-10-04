import { describe, expect, test } from "bun:test"
import { WorkspaceActiveSessionsProblemSchema } from "contracts/http/error"
import { bootTestApp } from "../test-support/test.harness"
import { enableAgent, seedBoundSession, seedWorkspace } from "../test-support/test.app"

const whichFn = (binaryName: string) =>
  binaryName === "agent" ? "/usr/local/bin/agent" : undefined

describe("DELETE /v1/workspaces/:id cascade", () => {
  test("closes live sessions and deletes workspace metadata", async () => {
    const { app, acpSupervisor, dataDir } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "cascade-session",
        sessionLoadSessionId: "cascade-session",
      },
    })
    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    const { sessionId } = await seedBoundSession({
      acpSupervisor,
      workspacePath: workspaceDir,
      agentId: "cursor",
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

    const listSessions = await app.inject({
      method: "GET",
      url: `/v1/sessions?cwd=${encodeURIComponent(workspaceDir)}`,
    })
    expect(listSessions.statusCode).toBe(200)
    const listed = JSON.parse(listSessions.body) as { items: Array<{ sessionId: string }> }
    expect(listed.items.some((item) => item.sessionId === sessionId)).toBe(false)
  })

  test("returns 409 with forceDeleteAvailable when close fails, then succeeds with force=true", async () => {
    const { app, acpSupervisor, dataDir } = await bootTestApp({
      whichFn,
      fakeAcpOptions: {
        capabilities: { loadSession: true, sessionClose: true, sessionList: true },
        sessionNewSessionId: "force-delete-session",
        sessionCloseFails: true,
      },
    })
    const { workspaceId, workspaceDir } = await seedWorkspace(app, dataDir)
    await enableAgent(app, "cursor", whichFn)

    await seedBoundSession({
      acpSupervisor,
      workspacePath: workspaceDir,
      agentId: "cursor",
    })

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}`,
    })
    const problem = WorkspaceActiveSessionsProblemSchema.parse(JSON.parse(deleteResponse.body))
    expect(deleteResponse.statusCode).toBe(409)
    expect(problem.forceDeleteAvailable).toBe(true)
    expect(problem.type).toBe("https://harold.local/problems/workspace-has-active-sessions")

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
