import { accessSync, constants, realpathSync, statSync } from "node:fs"
import path from "node:path"
import { expandHomePath } from "../config/expand-home-path"
import { WorkspacePathError } from "./workspace-errors"

export type CanonicalizeWorkspacePathResult =
  | { ok: true; canonicalPath: string }
  | { ok: false; error: WorkspacePathError }

const isMissingError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error.code === "ENOENT" || error.code === "ENOTDIR")

const isPermissionError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error.code === "EACCES" || error.code === "EPERM")

export const canonicalizeWorkspacePath = (
  inputPath: string,
): CanonicalizeWorkspacePathResult => {
  const expanded = expandHomePath(inputPath)
  const resolved = path.resolve(expanded)

  const realpathResult = (() => {
    try {
      return { ok: true as const, canonicalPath: realpathSync(resolved) }
    } catch (error: unknown) {
      if (isMissingError(error)) {
        return { ok: false as const, error: { kind: "missing" as const } }
      }
      if (isPermissionError(error)) {
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
      const stats = statSync(resolved)
      if (!stats.isDirectory()) {
        return { ok: false as const, error: { kind: "not_directory" as const } }
      }

      accessSync(resolved, constants.R_OK | constants.X_OK)
      return { ok: true as const }
    } catch (error: unknown) {
      if (isMissingError(error)) {
        return { ok: false as const, error: { kind: "missing" as const } }
      }
      if (isPermissionError(error)) {
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
