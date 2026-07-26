import { afterEach, describe, expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { canonicalizeWorkspacePath } from "./canonicalize-workspace-path"
import { chmodBlocksAccess } from "./test-chmod-blocks-access"

const tempDirs: string[] = []

const createTempDir = async (prefix: string) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("canonicalizeWorkspacePath", () => {
  test("expands ~ and resolves to real path", async () => {
    const home = os.homedir()
    const result = canonicalizeWorkspacePath("~")

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.canonicalPath).toBe(path.resolve(home))
    }
  })

  test("follows symlinks to canonical path", async () => {
    const base = await createTempDir("agent-server-canonical-")
    const target = path.join(base, "target")
    const link = path.join(base, "link")
    await mkdir(target)
    await symlink(target, link)

    const result = canonicalizeWorkspacePath(link)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.canonicalPath).toBe(path.resolve(target))
    }
  })

  test("rejects missing paths", () => {
    const result = canonicalizeWorkspacePath("/tmp/agent-server-missing-path-xyz")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("missing")
    }
  })

  test("rejects files", async () => {
    const base = await createTempDir("agent-server-canonical-")
    const filePath = path.join(base, "file.txt")
    await writeFile(filePath, "not a directory")

    const result = canonicalizeWorkspacePath(filePath)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("not_directory")
    }
  })

  test("rejects unreadable directories", async () => {
    const base = await createTempDir("agent-server-canonical-")
    const restricted = path.join(base, "restricted")
    await mkdir(restricted)
    await chmod(restricted, 0o000)

    if (!chmodBlocksAccess(restricted)) {
      await chmod(restricted, 0o755)
      return
    }

    const result = canonicalizeWorkspacePath(restricted)

    await chmod(restricted, 0o755)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("unreadable")
    }
  })
})
