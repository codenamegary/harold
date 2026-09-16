import { canonicalizePath } from "../filesystem/filesystem.canonicalize.path"
import { FilesystemPathError } from "../filesystem/filesystem.errors"

export type CanonicalizeAllowedRootsResult =
  | { ok: true; canonicalRoots: string[] }
  | { ok: false; error: FilesystemPathError; index: number }

export const canonicalizeAllowedRoots = (
  roots: readonly string[],
): CanonicalizeAllowedRootsResult => {
  const canonicalRoots: string[] = []

  for (const [index, root] of roots.entries()) {
    const canonicalizeResult = canonicalizePath(root)
    if (!canonicalizeResult.ok) {
      return { ok: false, error: canonicalizeResult.error, index }
    }

    if (!canonicalRoots.includes(canonicalizeResult.canonicalPath)) {
      canonicalRoots.push(canonicalizeResult.canonicalPath)
    }
  }

  return { ok: true, canonicalRoots }
}
