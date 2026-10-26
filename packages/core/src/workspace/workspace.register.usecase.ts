import { basename } from "node:path"
import { CreateWorkspaceBody, Workspace } from "contracts/http/workspace"
import { ReadDirectoryEntries } from "../filesystem/filesystem.ports"
import { RegisterWorkspaceError } from "./workspace.errors"
import { CanonicalizePath, CloneRepository, FindOrCreateWorkspace } from "./workspace.ports"

export type RegisterWorkspaceDeps = Readonly<{
  canonicalizePath: CanonicalizePath
  findOrCreateWorkspace: FindOrCreateWorkspace
  readDirectoryEntries: ReadDirectoryEntries
  cloneRepository: CloneRepository
}>

export type RegisterWorkspaceResult =
  | { ok: true; value: Workspace; created: boolean }
  | { ok: false; error: RegisterWorkspaceError }

const defaultWorkspaceName = (canonicalPath: string): string =>
  basename(canonicalPath) || canonicalPath

export const makeRegisterWorkspace =
  (deps: RegisterWorkspaceDeps) =>
  async (dto: CreateWorkspaceBody): Promise<RegisterWorkspaceResult> => {
    if (dto.source === "git" && dto.url.startsWith("-")) {
      return { ok: false, error: { kind: "invalid_git_url" } }
    }

    const canonicalizeResult = deps.canonicalizePath(dto.path)
    if (!canonicalizeResult.ok) {
      return { ok: false, error: { kind: "path", error: canonicalizeResult.error } }
    }

    const canonicalPath = canonicalizeResult.canonicalPath
    const name = dto.name ?? defaultWorkspaceName(canonicalPath)

    if (dto.source === "folder") {
      return deps.findOrCreateWorkspace({ name, canonicalPath })
    }

    const entries = await deps.readDirectoryEntries(canonicalPath)
    if (entries.length > 0) {
      return { ok: false, error: { kind: "destination_not_empty" } }
    }

    const cloned = await deps.cloneRepository({
      url: dto.url,
      destinationPath: canonicalPath,
    })
    if (!cloned.ok) {
      return {
        ok: false,
        error: {
          kind: "clone_failed",
          detail: `Clone failed for ${canonicalPath}: ${cloned.error.detail}`,
        },
      }
    }

    return deps.findOrCreateWorkspace({ name, canonicalPath })
  }
