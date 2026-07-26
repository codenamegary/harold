import { accessSync } from "node:fs"

export const chmodBlocksAccess = (targetPath: string): boolean => {
  try {
    accessSync(targetPath)
    return false
  } catch {
    return true
  }
}
