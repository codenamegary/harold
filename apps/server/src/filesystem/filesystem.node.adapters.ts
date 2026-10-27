import { accessSync, constants, realpathSync, statSync } from "node:fs"
import { mkdir, readdir, realpath, stat } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"
import { expandHomePath } from "core/filesystem/expand.home.path"
import {
  isAlreadyExistsFilesystemError,
  isMissingFilesystemError,
  isPermissionFilesystemError,
} from "core/filesystem/errors"
import {
  CanonicalizePath,
  CreateDirectoryPort,
  GetHomeDirectory,
  ReadDirectoryEntries,
  StatPath,
} from "core/filesystem/ports"

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

export const makeGetHomeDirectory = (): GetHomeDirectory => () => homedir()

export const makeCreateDirectory = (): CreateDirectoryPort => async (dirPath) => {
  try {
    await mkdir(dirPath)
    return { ok: true }
  } catch (error: unknown) {
    if (isAlreadyExistsFilesystemError(error)) {
      return { ok: false, error: { kind: "already_exists" } }
    }
    if (isPermissionFilesystemError(error)) {
      return { ok: false, error: { kind: "permission_denied" } }
    }
    throw error
  }
}
