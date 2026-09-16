import { CanonicalizePathResult } from "../filesystem/filesystem.canonicalize.path"
import { Workspace } from "contracts/http/workspace"
import { WorkspaceRepositoryError } from "./workspace.errors"

export type CanonicalizePath = (inputPath: string) => CanonicalizePathResult

export type GetAllowedRoots = () => readonly string[]

export type InsertWorkspaceInput = {
  name: string
  canonicalPath: string
}

export type InsertWorkspace = (input: InsertWorkspaceInput) =>
  | { ok: true; value: Workspace } | { ok: false; error: { kind: "duplicate_path" } }

export type FindWorkspaceById = (input: { id: string }) =>
  | { ok: true; value: Workspace }
  | { ok: false; error: WorkspaceRepositoryError }

export type DeleteWorkspaceRow = (input: { id: string }) =>
  | { ok: true; value: void }
  | { ok: false; error: WorkspaceRepositoryError }

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

export type DeleteWorkspace = (
  command: DeleteWorkspaceCommand,
) => Promise<DeleteWorkspaceResult>

export type ListAllWorkspaces = () => ReadonlyArray<Workspace>

export type ListWorkspaces = (query: {
  limit?: number
  cursor?: string
  q?: string
  state?: Workspace["state"]
}) =>
  | {
      ok: true
      value: {
        items: Workspace[]
        limit: number
        nextCursor?: string
        previousCursor?: string
        count: number
      }
    }
  | { ok: false; error: { kind: "invalid_cursor" } }

export type UpdateWorkspaceName = (input: { id: string; name: string }) =>
  | { ok: true; value: Workspace }
  | { ok: false; error: WorkspaceRepositoryError }

export type WorkspaceLiveSession = Readonly<{
  acpSessionId: string
  agentId: string
}>

export type CloseWorkspaceSessionFailure = Readonly<{
  acpSessionId: string
  reason: string
}>

export type ListLiveByWorkspaceRoot = (
  workspaceRoot: string,
) => ReadonlyArray<WorkspaceLiveSession>

export type CloseWorkspaceSessions = (params: {
  sessions: ReadonlyArray<WorkspaceLiveSession>
}) => Promise<{ failures: ReadonlyArray<CloseWorkspaceSessionFailure> }>

export type UnbindWorkspaceSessions = (params: {
  sessions: ReadonlyArray<WorkspaceLiveSession>
}) => void
