import {
  CloseWorkspaceSessions,
  DeleteWorkspaceRow,
  FindWorkspaceById,
  ListLiveByWorkspaceRoot,
  UnbindWorkspaceSessions,
} from "./workspace.ports"

export type DeleteWorkspaceDeps = Readonly<{
  findWorkspaceById: FindWorkspaceById
  listLiveByWorkspaceRoot: ListLiveByWorkspaceRoot
  closeWorkspaceSessions: CloseWorkspaceSessions
  unbindWorkspaceSessions: UnbindWorkspaceSessions
  deleteWorkspaceRow: DeleteWorkspaceRow
}>

export type DeleteWorkspaceCommand = Readonly<{
  workspaceId: string
  force: boolean
}>

export type DeleteWorkspaceError =
  | { readonly kind: "not_found" }
  | { readonly kind: "active_sessions"; readonly detail: string }

export type DeleteWorkspaceResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: DeleteWorkspaceError }

export const makeDeleteWorkspace =
  (deps: DeleteWorkspaceDeps) =>
  async (command: DeleteWorkspaceCommand): Promise<DeleteWorkspaceResult> => {
    const workspace = deps.findWorkspaceById({ id: command.workspaceId })
    if (!workspace.ok) {
      return { ok: false, error: { kind: "not_found" } }
    }

    const liveSessions = deps.listLiveByWorkspaceRoot(workspace.value.path)
    const closeResult = await deps.closeWorkspaceSessions({ sessions: liveSessions })

    if (closeResult.failures.length > 0 && !command.force) {
      return {
        ok: false,
        error: {
          kind: "active_sessions",
          detail: closeResult.failures.map((failure) => failure.reason).join("; "),
        },
      }
    }

    if (closeResult.failures.length > 0) {
      const failedIds = new Set(
        closeResult.failures.map((failure) => failure.acpSessionId),
      )
      deps.unbindWorkspaceSessions({
        sessions: liveSessions.filter((session) => failedIds.has(session.acpSessionId)),
      })
    }

    const deleted = deps.deleteWorkspaceRow({ id: command.workspaceId })
    if (!deleted.ok) {
      return { ok: false, error: { kind: "not_found" } }
    }

    return { ok: true }
  }
