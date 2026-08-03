import { canonicalizeWorkspacePath } from "../workspace/canonicalize-workspace-path"
import { WorkspacePathError } from "../workspace/workspace-errors"

export type CanonicalizeAllowedRootsResult =
  | { ok: true; canonicalRoots: string[] }
  | { ok: false; error: WorkspacePathError; index: number }

export const canonicalizeAllowedRoots = (
  roots: readonly string[],
): CanonicalizeAllowedRootsResult => {
  const canonicalRoots: string[] = []

  for (const [index, root] of roots.entries()) {
    const canonicalizeResult = canonicalizeWorkspacePath(root)
    if (!canonicalizeResult.ok) {
      return { ok: false, error: canonicalizeResult.error, index }
    }

    if (!canonicalRoots.includes(canonicalizeResult.canonicalPath)) {
      canonicalRoots.push(canonicalizeResult.canonicalPath)
    }
  }

  return { ok: true, canonicalRoots }
}
