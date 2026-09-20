import { afterEach, describe, expect, test } from "bun:test"
import { access, chmod, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  makeCanonicalizePath,
  makeReadDirectoryEntries,
  makeStatPath,
} from "./filesystem.node.adapters"

const tempDirs: string[] = []

const createTempDir = async (prefix: string) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

const chmodBlocksAccess = async (targetPath: string): Promise<boolean> => {
  try {
    await access(targetPath)
    return false
  } catch {
    return true
  }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("makeCanonicalizePath", () => {
  test("expands ~ and resolves to real path", async () => {
    const canonicalizePath = makeCanonicalizePath()
    const home = os.homedir()
    const result = canonicalizePath("~")

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.canonicalPath).toBe(path.resolve(home))
    }
  })

  test("follows symlinks to canonical path", async () => {
    const canonicalizePath = makeCanonicalizePath()
    const base = await createTempDir("agent-server-canonical-")
    const target = path.join(base, "target")
    const link = path.join(base, "link")
    await mkdir(target)
    await symlink(target, link)

    const result = canonicalizePath(link)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.canonicalPath).toBe(path.resolve(target))
    }
  })

  test("rejects missing paths", () => {
    const canonicalizePath = makeCanonicalizePath()
    const result = canonicalizePath("/tmp/agent-server-missing-path-xyz")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("missing")
    }
  })

  test("rejects files", async () => {
    const canonicalizePath = makeCanonicalizePath()
    const base = await createTempDir("agent-server-canonical-")
    const filePath = path.join(base, "file.txt")
    await writeFile(filePath, "not a directory")

    const result = canonicalizePath(filePath)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("not_directory")
    }
  })

  test("rejects unreadable directories", async () => {
    const canonicalizePath = makeCanonicalizePath()
    const base = await createTempDir("agent-server-canonical-")
    const restricted = path.join(base, "restricted")
    await mkdir(restricted)
    await chmod(restricted, 0o000)

    if (!(await chmodBlocksAccess(restricted))) {
      await chmod(restricted, 0o755)
      return
    }

    const result = canonicalizePath(restricted)

    await chmod(restricted, 0o755)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.kind).toBe("unreadable")
    }
  })
})

describe("makeReadDirectoryEntries", () => {
  test("lists the names of entries in a directory", async () => {
    const readDirectoryEntries = makeReadDirectoryEntries()
    const base = await createTempDir("agent-server-readdir-")
    await mkdir(path.join(base, "child-dir"))
    await writeFile(path.join(base, "file.txt"), "hi")

    const entries = await readDirectoryEntries(base)

    expect([...entries].map((entry) => entry.name).sort()).toEqual(["child-dir", "file.txt"])
  })

  test("fails when the directory is missing", async () => {
    const readDirectoryEntries = makeReadDirectoryEntries()

    let failed = false
    try {
      await readDirectoryEntries("/tmp/agent-server-missing-readdir-xyz")
    } catch {
      failed = true
    }

    expect(failed).toBe(true)
  })
})

describe("makeStatPath", () => {
  test("resolves symlinks and reports directories", async () => {
    const statPath = makeStatPath()
    const base = await createTempDir("agent-server-stat-")
    const target = path.join(base, "target")
    const link = path.join(base, "link")
    await mkdir(target)
    await symlink(target, link)

    const linkResult = await statPath(link)

    expect(linkResult).toEqual({ ok: true, canonicalPath: target, isDirectory: true })
  })

  test("reports files as non-directories", async () => {
    const statPath = makeStatPath()
    const base = await createTempDir("agent-server-stat-")
    const filePath = path.join(base, "file.txt")
    await writeFile(filePath, "hi")

    const result = await statPath(filePath)

    expect(result).toEqual({ ok: true, canonicalPath: filePath, isDirectory: false })
  })

  test("fails for missing paths", async () => {
    const statPath = makeStatPath()

    const result = await statPath("/tmp/agent-server-missing-stat-xyz")

    expect(result).toEqual({ ok: false })
  })
})
