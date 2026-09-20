import { realpathSync } from "node:fs"
import path from "node:path"

export type ResolvePathWithinWorkspaceResult =
  | { ok: true; absolutePath: string }
  | { ok: false; reason: string }

const resolveRealpath = (targetPath: string): ResolvePathWithinWorkspaceResult => {
  try {
    return { ok: true, absolutePath: realpathSync(targetPath) }
  } catch {
    return { ok: false, reason: "path outside workspace root" }
  }
}

const isWithinWorkspaceRoot = (params: {
  workspaceRoot: string
  absolutePath: string
}): boolean => {
  const relative = path.relative(params.workspaceRoot, params.absolutePath)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

export const resolvePathWithinWorkspace = (params: {
  workspaceRoot: string
  filePath: string
}): ResolvePathWithinWorkspaceResult => {
  const workspaceResult = resolveRealpath(params.workspaceRoot)
  if (!workspaceResult.ok) {
    return { ok: false, reason: "session not bound" }
  }

  const resolved = path.resolve(workspaceResult.absolutePath, params.filePath)
  const fileResult = resolveRealpath(resolved)
  if (!fileResult.ok) {
    const parent = path.dirname(resolved)
    const parentResult = resolveRealpath(parent)
    if (
      !parentResult.ok ||
      !isWithinWorkspaceRoot({
        workspaceRoot: workspaceResult.absolutePath,
        absolutePath: parentResult.absolutePath,
      })
    ) {
      return { ok: false, reason: "path outside workspace root" }
    }

    return { ok: true, absolutePath: resolved }
  }

  if (
    !isWithinWorkspaceRoot({
      workspaceRoot: workspaceResult.absolutePath,
      absolutePath: fileResult.absolutePath,
    })
  ) {
    return { ok: false, reason: "path outside workspace root" }
  }

  return { ok: true, absolutePath: fileResult.absolutePath }
}
