export type FileExists = (path: string) => boolean

export type DetectFreshInstallDeps = Readonly<{
  databasePath: string
  fileExists: FileExists
}>

/**
 * A fresh install is a data dir whose database has never been created, so
 * first-run flows (setup wizard) can trigger on it (ADR-0006).
 */
export const isFreshInstall = (deps: DetectFreshInstallDeps): boolean =>
  !deps.fileExists(deps.databasePath)
