import { CanonicalizeWorkspacePathResult } from "./canonicalize.workspace.path"
import { Workspace } from "contracts/http/workspace"
import { WorkspaceRepositoryError } from "./workspace.errors"

export type CanonicalizePath = (inputPath: string) => CanonicalizeWorkspacePathResult

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

export type ListAllWorkspaces = () => ReadonlyArray<Workspace>

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
