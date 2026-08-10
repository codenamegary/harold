const basename = (pathValue: string): string => {
  const normalized = pathValue.replaceAll("\\", "/")
  const base = normalized.split("/").at(-1) ?? normalized
  return base.replace(/\.exe$/i, "").replace(/\.cmd$/i, "")
}

export const isNpxRunnerPath = (pathValue: string): boolean => basename(pathValue) === "npx"

export const argsIncludeNpxYesFlag = (args: readonly string[]): boolean =>
  args.some((arg) => arg === "-y" || arg === "--yes")

export const needsNpxYesFlag = (pathValue: string, args: readonly string[]): boolean =>
  isNpxRunnerPath(pathValue) && !argsIncludeNpxYesFlag(args)

export const insertNpxYesFlag = (args: readonly string[]): string[] => {
  if (argsIncludeNpxYesFlag(args)) {
    return [...args]
  }

  return ["-y", ...args]
}
