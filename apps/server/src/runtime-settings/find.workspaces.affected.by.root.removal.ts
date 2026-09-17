import { Workspace } from "contracts/http/workspace"
import { isDescendantOf } from "../filesystem/filesystem.is.descendant.of"

export const findWorkspacesAffectedByRootRemoval = (params: {
  workspaces: readonly Workspace[]
  previousRoots: readonly string[]
  nextRoots: readonly string[]
}): Workspace[] => {
  const removedRoots = params.previousRoots.filter(
    (root) => !params.nextRoots.includes(root),
  )

  if (removedRoots.length === 0) {
    return []
  }

  return params.workspaces.filter((workspace) => {
    const coveredByNext = params.nextRoots.some((root) =>
      isDescendantOf({ path: root, candidatePath: workspace.path }),
    )
    if (coveredByNext) {
      return false
    }

    return removedRoots.some((root) =>
      isDescendantOf({ path: root, candidatePath: workspace.path }),
    )
  })
}
