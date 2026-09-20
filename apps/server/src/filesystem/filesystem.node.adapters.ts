import { accessSync, constants, realpathSync, statSync } from "node:fs"
import { readdir, realpath, stat } from "node:fs/promises"
import path from "node:path"
import { expandHomePath } from "./filesystem.expand.home.path"
import { isMissingFilesystemError, isPermissionFilesystemError } from "./filesystem.errors"
import { CanonicalizePath, ReadDirectoryEntries, StatPath } from "./filesystem.ports"

export const makeCanonicalizePath = (): CanonicalizePath => (inputPath) => {
  const expanded = expandHomePath(inputPath)
  const resolved = path.resolve(expanded)

  const realpathResult = (() => {
    try {
      return { ok: true as const, canonicalPath: realpathSync(resolved) }
    } catch (error: unknown) {
      if (isMissingFilesystemError(error)) {
        return { ok: false as const, error: { kind: "missing" as const } }
      }
      if (isPermissionFilesystemError(error)) {
        return { ok: false as const, error: { kind: "unreadable" as const } }
      }
      throw error
    }
  })()

  if (!realpathResult.ok) {
    return realpathResult
  }

  const validationResult = (() => {
    try {
      const stats = statSync(realpathResult.canonicalPath)
      if (!stats.isDirectory()) {
        return { ok: false as const, error: { kind: "not_directory" as const } }
      }

      accessSync(realpathResult.canonicalPath, constants.R_OK | constants.X_OK)
      return { ok: true as const }
    } catch (error: unknown) {
      if (isMissingFilesystemError(error)) {
        return { ok: false as const, error: { kind: "missing" as const } }
      }
      if (isPermissionFilesystemError(error)) {
        return { ok: false as const, error: { kind: "unreadable" as const } }
      }
      throw error
    }
  })()

  if (!validationResult.ok) {
    return validationResult
  }

  return { ok: true, canonicalPath: realpathResult.canonicalPath }
}

export const makeReadDirectoryEntries = (): ReadDirectoryEntries => async (dirPath) => {
  const entries = await readdir(dirPath, { withFileTypes: true })
  return entries.map((entry) => ({ name: entry.name }))
}

export const makeStatPath = (): StatPath => async (inputPath) => {
  try {
    const canonicalPath = await realpath(inputPath)
    const stats = await stat(canonicalPath)
    return { ok: true, canonicalPath, isDirectory: stats.isDirectory() }
  } catch {
    return { ok: false }
  }
}
