import {
  FindOrCreateWorkspace,
  FindWorkspaceByCanonicalPath,
  InsertWorkspace,
  TouchWorkspaceLastUsedAt,
} from "./workspace.ports"

export type FindOrCreateWorkspaceDeps = Readonly<{
  findWorkspaceByCanonicalPath: FindWorkspaceByCanonicalPath
  insertWorkspace: InsertWorkspace
  touchWorkspaceLastUsedAt: TouchWorkspaceLastUsedAt
}>

const openExisting = (
  deps: FindOrCreateWorkspaceDeps,
  id: string,
): ReturnType<FindOrCreateWorkspace> => {
  const touched = deps.touchWorkspaceLastUsedAt({ id })
  return touched.ok
    ? { ok: true, value: touched.value, created: false }
    : { ok: false, error: touched.error }
}

/**
 * Registers a canonical path once. The insert is the atomic step: if another
 * process wins the unique-path race, the loser re-reads the winner's row and
 * opens it instead of failing.
 */
export const makeFindOrCreateWorkspace =
  (deps: FindOrCreateWorkspaceDeps): FindOrCreateWorkspace =>
  (input) => {
    const existing = deps.findWorkspaceByCanonicalPath({
      canonicalPath: input.canonicalPath,
    })

    if (existing.ok) {
      return openExisting(deps, existing.value.id)
    }

    if (existing.error.kind !== "not_found") {
      return { ok: false, error: existing.error }
    }

    const inserted = deps.insertWorkspace(input)
    if (inserted.ok) {
      return { ok: true, value: inserted.value, created: true }
    }

    if (inserted.error.kind !== "duplicate_path") {
      return { ok: false, error: inserted.error }
    }

    const raced = deps.findWorkspaceByCanonicalPath({
      canonicalPath: input.canonicalPath,
    })
    if (!raced.ok) {
      return { ok: false, error: raced.error }
    }

    return openExisting(deps, raced.value.id)
  }
