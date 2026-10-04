import { accessSync, constants } from "node:fs"

export type ValidateExecutablePathFn = (executablePath: string) => boolean

export const validateExecutablePath: ValidateExecutablePathFn = (executablePath) => {
  try {
    accessSync(executablePath, constants.F_OK | constants.X_OK)
    return true
  } catch {
    return false
  }
}
