import { accessSync, constants, statSync } from "node:fs"
import { WorkspaceState } from "contracts/http/workspace"

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

export const probeWorkspaceState = (canonicalPath: string): WorkspaceState => {
  try {
    const stats = statSync(canonicalPath)
    if (!stats.isDirectory()) {
      return "missing"
    }

    accessSync(canonicalPath, constants.R_OK | constants.X_OK)
    return "available"
  } catch (error: unknown) {
    if (isMissingError(error)) {
      return "missing"
    }
    if (isPermissionError(error)) {
      return "unavailable"
    }
    throw error
  }
}
