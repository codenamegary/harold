import { afterEach, describe, expect, test } from "bun:test"
import { accessSync } from "node:fs"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { probeWorkspaceState } from "./probe.workspace.state"

const tempDirs: string[] = []

const createTempDir = async (prefix: string) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

const chmodBlocksAccess = (targetPath: string): boolean => {
  try {
    accessSync(targetPath)
    return false
  } catch {
    return true
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("probeWorkspaceState", () => {
  test("returns available for readable directories", async () => {
    const dir = await createTempDir("agent-server-probe-")

    expect(probeWorkspaceState(dir)).toBe("available")
  })

  test("returns missing for non-existent paths", () => {
    expect(probeWorkspaceState("/tmp/agent-server-probe-missing-xyz")).toBe("missing")
  })

  test("returns unavailable for unreadable directories", async () => {
    const base = await createTempDir("agent-server-probe-")
    const restricted = path.join(base, "restricted")
    await mkdir(restricted)
    await chmod(restricted, 0o000)

    if (!chmodBlocksAccess(restricted)) {
      await chmod(restricted, 0o755)
      return
    }

    expect(probeWorkspaceState(restricted)).toBe("unavailable")

    await chmod(restricted, 0o755)
  })
})
