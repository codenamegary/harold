import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  makeDeleteAttachmentFile,
  makeEnsureAttachmentsDir,
  makeEnsureGitignoreEntry,
  makeReadAttachmentBytes,
  makeWriteAttachmentBytes,
} from "./attachments.fs.adapters"

const tempDirs: string[] = []

const createTempWorkspace = async (options: { gitignore?: string } = {}) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "agent-server-att-"))
  tempDirs.push(dir)
  if (options.gitignore !== undefined) {
    await writeFile(path.join(dir, ".gitignore"), options.gitignore, "utf8")
  }
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe("ensureAttachmentsDir", () => {
  test("creates the attachments folder and returns its path", async () => {
    const workspace = await createTempWorkspace()
    const ensureAttachmentsDir = makeEnsureAttachmentsDir()

    const dir = await ensureAttachmentsDir(workspace)

    expect(dir).toBe(path.join(workspace, ".agent-server", "attachments"))
    expect((await stat(dir)).isDirectory()).toBe(true)
  })
})

describe("attachment byte adapters", () => {
  test("round-trips written bytes", async () => {
    const workspace = await createTempWorkspace()
    const ensureAttachmentsDir = makeEnsureAttachmentsDir()
    const writeAttachmentBytes = makeWriteAttachmentBytes()
    const readAttachmentBytes = makeReadAttachmentBytes()
    const filePath = path.join(await ensureAttachmentsDir(workspace), "att_1.png")

    await writeAttachmentBytes({ filePath, bytes: new Uint8Array([1, 2, 3]) })

    expect(await readAttachmentBytes(filePath)).toEqual(new Uint8Array([1, 2, 3]))
  })

  test("reads null for a missing file", async () => {
    const workspace = await createTempWorkspace()

    expect(await makeReadAttachmentBytes()(path.join(workspace, "missing.png"))).toBeNull()
  })

  test("reads null for a directory", async () => {
    const workspace = await createTempWorkspace()
    const dir = await makeEnsureAttachmentsDir()(workspace)

    expect(await makeReadAttachmentBytes()(dir)).toBeNull()
  })

  test("deletes a stored file and reports misses", async () => {
    const workspace = await createTempWorkspace()
    const dir = await makeEnsureAttachmentsDir()(workspace)
    const filePath = path.join(dir, "att_1.png")
    await makeWriteAttachmentBytes()({ filePath, bytes: new Uint8Array([1]) })
    const deleteAttachmentFile = makeDeleteAttachmentFile()

    expect(await deleteAttachmentFile(filePath)).toBe(true)
    expect(await deleteAttachmentFile(filePath)).toBe(false)
  })
})

describe("ensureGitignoreEntry", () => {
  test("appends the attachments path to an existing .gitignore", async () => {
    const workspace = await createTempWorkspace({ gitignore: "node_modules\n" })

    await makeEnsureGitignoreEntry()(workspace)

    const content = await readFile(path.join(workspace, ".gitignore"), "utf8")
    expect(content).toBe("node_modules\n.agent-server/attachments/\n")
  })

  test("is idempotent when the entry already exists", async () => {
    const workspace = await createTempWorkspace({
      gitignore: "node_modules\n.agent-server/attachments/\n",
    })

    await makeEnsureGitignoreEntry()(workspace)

    const content = await readFile(path.join(workspace, ".gitignore"), "utf8")
    expect(content).toBe("node_modules\n.agent-server/attachments/\n")
  })

  test("skips without creating a .gitignore when none exists", async () => {
    const workspace = await createTempWorkspace()

    await makeEnsureGitignoreEntry()(workspace)

    expect(readFile(path.join(workspace, ".gitignore"), "utf8")).rejects.toThrow()
  })

  test("inserts a separating newline when the file does not end with one", async () => {
    const workspace = await createTempWorkspace({ gitignore: "node_modules" })

    await makeEnsureGitignoreEntry()(workspace)

    const content = await readFile(path.join(workspace, ".gitignore"), "utf8")
    expect(content).toBe("node_modules\n.agent-server/attachments/\n")
  })
})
