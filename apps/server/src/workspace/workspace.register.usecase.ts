import { CreateWorkspaceBody, Workspace } from "contracts/http/workspace"
import { isPathUnderAllowedRoot } from "./workspace.is.path.under.allowed.root"
import { CanonicalizePath, GetAllowedRoots, InsertWorkspace } from "./workspace.ports"
import { WorkspaceRepositoryError } from "./workspace.errors"

export type RegisterWorkspaceDeps = Readonly<{
  canonicalizePath: CanonicalizePath
  getAllowedRoots: GetAllowedRoots
  insertWorkspace: InsertWorkspace
}>

export type RegisterWorkspaceResult =
  | { ok: true; value: Workspace }
  | { ok: false; error: WorkspaceRepositoryError }

export const makeRegisterWorkspace =
  (deps: RegisterWorkspaceDeps) =>
    (dto: CreateWorkspaceBody): RegisterWorkspaceResult => {
      const canonicalizeResult = deps.canonicalizePath(dto.path)
      if (!canonicalizeResult.ok) {
        return { ok: false, error: { kind: "path", error: canonicalizeResult.error } }
      }

      const allowedRoots = deps.getAllowedRoots()
      if (allowedRoots.length === 0) {
        return { ok: false, error: { kind: "outside_allowed_root" } }
      }

      const isAllowed = allowedRoots.some((allowedRoot) =>
        isPathUnderAllowedRoot({
          allowedRoot,
          candidatePath: canonicalizeResult.canonicalPath,
        })
      )
      if (!isAllowed) {
        return { ok: false, error: { kind: "outside_allowed_root" } }
      }

      return deps.insertWorkspace({
        name: dto.name,
        canonicalPath: canonicalizeResult.canonicalPath,
      })
    }
