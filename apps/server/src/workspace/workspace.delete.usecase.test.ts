import { describe, expect, test } from "bun:test"
import { Workspace } from "contracts/http/workspace"
import { makeDeleteWorkspace } from "./workspace.delete.usecase"
import { WorkspaceLiveSession } from "./workspace.ports"

const storedWorkspace: Workspace = {
  id: "ws_01J0000000000000000000000",
  name: "App",
  path: "/allowed/app",
  state: "available",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastUsedAt: "2026-01-01T00:00:00.000Z",
}

const liveSession: WorkspaceLiveSession = {
  acpSessionId: "sess_1",
  agentId: "cursor",
}

describe("delete workspace", () => {
  test("returns not_found when the workspace does not exist", async () => {
    const deleteWorkspace = makeDeleteWorkspace({
      findWorkspaceById: () => ({ ok: false, error: { kind: "not_found" } }),
      listLiveByWorkspaceRoot: () => {
        throw new Error("listLiveByWorkspaceRoot should not run when the workspace is missing")
      },
      closeWorkspaceSessions: async () => {
        throw new Error("closeWorkspaceSessions should not run when the workspace is missing")
      },
      unbindWorkspaceSessions: () => {
        throw new Error("unbindWorkspaceSessions should not run when the workspace is missing")
      },
      deleteWorkspaceRow: () => {
        throw new Error("deleteWorkspaceRow should not run when the workspace is missing")
      },
    })

    const result = await deleteWorkspace({
      workspaceId: storedWorkspace.id,
      force: false,
    })

    expect(result).toEqual({ ok: false, error: { kind: "not_found" } })
  })

  test("closes live sessions and deletes the row when close succeeds", async () => {
    const closed: WorkspaceLiveSession[][] = []
    const deleteWorkspace = makeDeleteWorkspace({
      findWorkspaceById: () => ({ ok: true, value: storedWorkspace }),
      listLiveByWorkspaceRoot: (workspaceRoot) => {
        expect(workspaceRoot).toBe(storedWorkspace.path)
        return [liveSession]
      },
      closeWorkspaceSessions: async (params) => {
        closed.push([...params.sessions])
        return { failures: [] }
      },
      unbindWorkspaceSessions: () => {
        throw new Error("unbindWorkspaceSessions should not run when close succeeds")
      },
      deleteWorkspaceRow: (input) => {
        expect(input.id).toBe(storedWorkspace.id)
        return { ok: true, value: undefined }
      },
    })

    const result = await deleteWorkspace({
      workspaceId: storedWorkspace.id,
      force: false,
    })

    expect(result).toEqual({ ok: true })
    expect(closed).toEqual([[liveSession]])
  })

  test("returns active_sessions when close fails and force is false", async () => {
    const deleteWorkspace = makeDeleteWorkspace({
      findWorkspaceById: () => ({ ok: true, value: storedWorkspace }),
      listLiveByWorkspaceRoot: () => [liveSession],
      closeWorkspaceSessions: async () => ({
        failures: [{ acpSessionId: liveSession.acpSessionId, reason: "ACP supervisor is not ready" }],
      }),
      unbindWorkspaceSessions: () => {
        throw new Error("unbindWorkspaceSessions should not run when force is false")
      },
      deleteWorkspaceRow: () => {
        throw new Error("deleteWorkspaceRow should not run when close fails without force")
      },
    })

    const result = await deleteWorkspace({
      workspaceId: storedWorkspace.id,
      force: false,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: "active_sessions",
        detail: "ACP supervisor is not ready",
      },
    })
  })

  test("unbinds failed sessions and deletes the row when force is true", async () => {
    const unbound: WorkspaceLiveSession[][] = []
    const deleteWorkspace = makeDeleteWorkspace({
      findWorkspaceById: () => ({ ok: true, value: storedWorkspace }),
      listLiveByWorkspaceRoot: () => [liveSession],
      closeWorkspaceSessions: async () => ({
        failures: [{ acpSessionId: liveSession.acpSessionId, reason: "session close failed" }],
      }),
      unbindWorkspaceSessions: (params) => {
        unbound.push([...params.sessions])
      },
      deleteWorkspaceRow: () => ({ ok: true, value: undefined }),
    })

    const result = await deleteWorkspace({
      workspaceId: storedWorkspace.id,
      force: true,
    })

    expect(result).toEqual({ ok: true })
    expect(unbound).toEqual([[liveSession]])
  })
})
