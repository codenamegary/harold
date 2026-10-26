import { CanonicalizePath } from "core/filesystem/ports"
import { ResolveSessionFolder } from "./attachments.ports"

export type ResolveSessionFolderDeps = Readonly<{
  findSessionCwd: (params: { agentId: string; sessionId: string }) => string | undefined
  canonicalizePath: CanonicalizePath
}>

/**
 * The agent owns the session and reports its folder, so that folder is the
 * attachment home. Sessions accept any cwd, and no workspace metadata is
 * consulted.
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

    return { ok: true, value: canonical.canonicalPath }
  }
