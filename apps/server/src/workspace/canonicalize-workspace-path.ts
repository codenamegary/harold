import { accessSync, constants, realpathSync, statSync } from "node:fs"
import path from "node:path"
import { expandHomePath } from "../config/expand-home-path"
import { isMissingFilesystemError, isPermissionFilesystemError } from "./filesystem-errors"
import { WorkspacePathError } from "./workspace-errors"

export type CanonicalizeWorkspacePathResult =
  | { ok: true; canonicalPath: string }
  | { ok: false; error: WorkspacePathError }

export const canonicalizeWorkspacePath = (
  inputPath: string,
): CanonicalizeWorkspacePathResult => {
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
