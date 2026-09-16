import path from "node:path"

export const isPathUnderAllowedRoot = (params: {
  allowedRoot: string
  candidatePath: string
}): boolean => {
  const relative = path.relative(params.allowedRoot, params.candidatePath)
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  )
}
