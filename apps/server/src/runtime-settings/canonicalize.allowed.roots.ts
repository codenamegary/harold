import { canonicalizePath } from "../filesystem/filesystem.canonicalize.path"
import { CanonicalizeAllowedRoots } from "./runtime-settings.ports"

export const canonicalizeAllowedRoots: CanonicalizeAllowedRoots = (
  roots,
): ReturnType<CanonicalizeAllowedRoots> => {
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
