import path from "node:path"

export const isDescendantOf = (params: { path: string, candidatePath: string }): boolean => {
  const relative = path.relative(params.path, params.candidatePath)
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}
