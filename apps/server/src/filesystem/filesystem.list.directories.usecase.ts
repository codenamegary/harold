import path from "node:path"
import { FilesystemPathError } from "./filesystem.errors"
import { isDescendantOf } from "./filesystem.is.descendant.of"
import { CanonicalizePath, ReadDirectoryEntries, StatPath } from "./filesystem.ports"

export type FilesystemDirectoryItem = {
  name: string
  path: string
}

export type ListFilesystemDirectoriesResult =
  | { ok: true; items: FilesystemDirectoryItem[] }
  | { ok: false; error: { kind: "not_allowed" } }
  | { ok: false; error: { kind: "path"; error: FilesystemPathError } }

export type ListFilesystemDirectoriesParams = Readonly<{
  root: string
  allowedRoots: readonly string[]
}>

export type ListDirectories = (
  params: ListFilesystemDirectoriesParams,
) => Promise<ListFilesystemDirectoriesResult>

export type ListDirectoriesDeps = Readonly<{
  canonicalizePath: CanonicalizePath
  readDirectoryEntries: ReadDirectoryEntries
  statPath: StatPath
}>

export const makeListDirectories =
  (deps: ListDirectoriesDeps): ListDirectories =>
  async (params) => {
    const canonicalizeResult = deps.canonicalizePath(params.root)
    if (!canonicalizeResult.ok) {
      return { ok: false, error: { kind: "path", error: canonicalizeResult.error } }
    }

    const canonicalRoot = canonicalizeResult.canonicalPath

    if (!params.allowedRoots.includes(canonicalRoot)) {
      return { ok: false, error: { kind: "not_allowed" } }
    }

    const entries = await deps.readDirectoryEntries(canonicalRoot)
    const items: FilesystemDirectoryItem[] = []

    for (const entry of entries) {
      const childPath = path.join(canonicalRoot, entry.name)

      const statResult = await deps.statPath(childPath)
      if (!statResult.ok || !statResult.isDirectory) {
        continue
      }

      if (
        !isDescendantOf({
          path: canonicalRoot,
          candidatePath: statResult.canonicalPath,
        })
      ) {
        continue
      }

      items.push({ name: entry.name, path: childPath })
    }

    return {
      ok: true,
      items: [...items].sort((left, right) => left.name.localeCompare(right.name)),
    }
  }
