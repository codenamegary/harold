import { accessSync, constants, statSync } from "node:fs"
import { WorkspaceState } from "contracts/http/workspace"
import { isMissingFilesystemError, isPermissionFilesystemError } from "./filesystem.errors"

export const probeWorkspaceState = (canonicalPath: string): WorkspaceState => {
  try {
    const stats = statSync(canonicalPath)
    if (!stats.isDirectory()) {
      return "missing"
    }

    accessSync(canonicalPath, constants.R_OK | constants.X_OK)
    return "available"
  } catch (error: unknown) {
    if (isMissingFilesystemError(error)) {
      return "missing"
    }
    if (isPermissionFilesystemError(error)) {
      return "unavailable"
    }
    throw error
  }
}
