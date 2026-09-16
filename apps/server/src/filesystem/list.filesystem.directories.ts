import { readdirSync, realpathSync, statSync } from "node:fs"
import path from "node:path"
import { canonicalizePath } from "./filesystem.canonicalize.path"
import { isPathUnderAllowedRoot } from "../workspace/workspace.is.path.under.allowed.root"
import { FilesystemPathError } from "./filesystem.errors"

export type FilesystemDirectoryItem = {
  name: string
  path: string
}

export type ListFilesystemDirectoriesResult =
  | { ok: true; items: FilesystemDirectoryItem[] }
  | { ok: false; error: { kind: "not_allowed" } }
  | { ok: false; error: { kind: "path"; error: FilesystemPathError } }

export const listFilesystemDirectories = (params: {
  root: string
  allowedRoots: readonly string[]
}): ListFilesystemDirectoriesResult => {
  const canonicalizeResult = canonicalizePath(params.root)
  if (!canonicalizeResult.ok) {
    return { ok: false, error: { kind: "path", error: canonicalizeResult.error } }
  }

  if (!params.allowedRoots.includes(canonicalizeResult.canonicalPath)) {
    return { ok: false, error: { kind: "not_allowed" } }
  }

  const entries = readdirSync(canonicalizeResult.canonicalPath, { withFileTypes: true })
  const items: FilesystemDirectoryItem[] = []

  for (const entry of entries) {
    const childPath = path.join(canonicalizeResult.canonicalPath, entry.name)

    const resolved = (() => {
      try {
        const realPath = realpathSync(childPath)
        const stats = statSync(realPath)
        if (!stats.isDirectory()) {
          return undefined
        }
        return realPath
      } catch {
        return undefined
      }
    })()

    if (resolved === undefined) {
      continue
    }

    if (
      !isPathUnderAllowedRoot({
        allowedRoot: canonicalizeResult.canonicalPath,
        candidatePath: resolved,
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
