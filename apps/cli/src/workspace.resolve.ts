import { Workspace } from "contracts/http/workspace"
import { CanonicalizePath, FindWorkspaceById, ListAllWorkspaces } from "core/workspace/ports"

export type WorkspaceReferenceResolution =
  | { ok: true; value: Workspace }
  | {
      ok: false
      error:
        | { readonly kind: "not_found"; readonly reference: string }
        | {
            readonly kind: "ambiguous_name"
            readonly reference: string
            readonly workspaces: Workspace[]
          }
    }

export type ResolveWorkspaceReferenceDeps = Readonly<{
  canonicalizePath: CanonicalizePath
  findWorkspaceById: FindWorkspaceById
  listAllWorkspaces: ListAllWorkspaces
}>

export const makeResolveWorkspaceReference =
  (deps: ResolveWorkspaceReferenceDeps) =>
  (reference: string): WorkspaceReferenceResolution => {
    const byId = deps.findWorkspaceById({ id: reference })
    if (byId.ok) {
      return { ok: true, value: byId.value }
    }

    const workspaces = deps.listAllWorkspaces()

    const canonicalized = deps.canonicalizePath(reference)
    if (canonicalized.ok) {
      const byPath = workspaces.find((workspace) => workspace.path === canonicalized.canonicalPath)
      if (byPath !== undefined) {
        return { ok: true, value: byPath }
      }
    }

    const byName = workspaces.filter((workspace) => workspace.name === reference)
    if (byName.length === 1 && byName[0] !== undefined) {
      return { ok: true, value: byName[0] }
    }
    if (byName.length > 1) {
      return { ok: false, error: { kind: "ambiguous_name", reference, workspaces: byName } }
    }

    return { ok: false, error: { kind: "not_found", reference } }
  }
