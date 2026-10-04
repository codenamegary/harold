import { execSync } from "node:child_process"
import os from "node:os"
import path from "node:path"

export const smokeRunRequested = (): boolean =>
  process.env.HAROLD_RUN_SMOKE === "1" || process.env.HAROLD_RUN_CURSOR_SMOKE === "1"

export const hasCursorAuth = (): boolean => {
  if (process.env.CURSOR_API_KEY ?? process.env.CURSOR_AUTH_TOKEN) {
    return true
  }

  try {
    const output = execSync("agent status", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    return output.includes("Logged in")
  } catch {
    return false
  }
}

export const resolveCursorAgentPath = (): string | undefined => {
  try {
    return execSync("which agent", { encoding: "utf8" }).trim()
  } catch {
    return undefined
  }
}

export const resolveOpenCodePath = (): string | undefined => {
  try {
    return execSync("which opencode", { encoding: "utf8" }).trim()
  } catch {
    const homePath = path.join(os.homedir(), ".opencode", "bin", "opencode")
    try {
      execSync(`test -x ${homePath}`, { stdio: "ignore" })
      return homePath
    } catch {
      return undefined
    }
  }
}
