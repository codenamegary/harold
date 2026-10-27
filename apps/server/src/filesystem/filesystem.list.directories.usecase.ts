import path from "node:path"
import { FilesystemPathError } from "core/filesystem/errors"
import {
  CanonicalizePath,
  GetHomeDirectory,
  ReadDirectoryEntries,
  StatPath,
} from "core/filesystem/ports"

export type FilesystemDirectoryItem = {
  name: string
  path: string
}

export type ListFilesystemDirectoriesValue = {
  path: string
  parent: string | null
  items: FilesystemDirectoryItem[]
}

export type ListFilesystemDirectoriesResult =
  | { ok: true; value: ListFilesystemDirectoriesValue }
  | { ok: false; error: { kind: "path"; error: FilesystemPathError } }

export type ListFilesystemDirectoriesParams = Readonly<{
  root?: string
}>

export type ListDirectories = (
  params: ListFilesystemDirectoriesParams,
) => Promise<ListFilesystemDirectoriesResult>

export type ListDirectoriesDeps = Readonly<{
  canonicalizePath: CanonicalizePath
  readDirectoryEntries: ReadDirectoryEntries
  statPath: StatPath
  getHomeDirectory: GetHomeDirectory
}>

export const makeListDirectories =
  (deps: ListDirectoriesDeps): ListDirectories =>
  async (params) => {
    const canonicalizeResult = deps.canonicalizePath(params.root ?? deps.getHomeDirectory())
    if (!canonicalizeResult.ok) {
      return { ok: false, error: { kind: "path", error: canonicalizeResult.error } }
    }

    const canonicalRoot = canonicalizeResult.canonicalPath
    const entries = await deps.readDirectoryEntries(canonicalRoot)
    const items: FilesystemDirectoryItem[] = []

    for (const entry of entries) {
      const statResult = await deps.statPath(path.join(canonicalRoot, entry.name))
      if (!statResult.ok || !statResult.isDirectory) {
        continue
      }

      items.push({ name: entry.name, path: statResult.canonicalPath })
    }

    return {
      ok: true,
      value: {
        path: canonicalRoot,
        parent: canonicalRoot === "/" ? null : path.dirname(canonicalRoot),
        items: [...items].sort((left, right) => left.name.localeCompare(right.name)),
      },
    }
  }
