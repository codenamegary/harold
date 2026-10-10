import { isDescendantOf } from "core/filesystem/is.descendant.of"
import { CanonicalizePath } from "core/filesystem/ports"
import { ResolveSessionFolder } from "./attachments.ports"

export type ResolveSessionFolderDeps = Readonly<{
  findSessionCwd: (params: { agentId: string; sessionId: string }) => string | undefined
  canonicalizePath: CanonicalizePath
  getAllowedRoots: () => readonly string[]
}>

/**
 * The agent owns the session and reports its folder, so that folder is the
 * attachment home. No registered workspace is involved. The server only writes
 * there when the folder sits under an allowed root.
 */
export const makeResolveSessionFolder =
  (deps: ResolveSessionFolderDeps): ResolveSessionFolder =>
  (params) => {
    const cwd = deps.findSessionCwd(params)
    if (cwd === undefined) {
      return { ok: false, error: { kind: "unknown_session" } }
    }

    const canonical = deps.canonicalizePath(cwd)
    if (!canonical.ok) {
      return { ok: false, error: { kind: "folder_unavailable" } }
    }

    const allowed = deps
      .getAllowedRoots()
      .some((root) => isDescendantOf({ path: root, candidatePath: canonical.canonicalPath }))
    if (!allowed) {
      return { ok: false, error: { kind: "outside_allowed_roots" } }
    }

    return { ok: true, value: canonical.canonicalPath }
  }
