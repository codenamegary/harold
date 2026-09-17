import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import {
  createAttachmentsService,
  inferAttachmentKind,
  isBlockedAttachmentName,
} from "./attachments.service"
import { ensureGitignoreEntry } from "./gitignore"

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

describe("saveAttachment", () => {
  test("writes the file under .agent-server/attachments and returns a descriptor", async () => {
    const workspace = await createTempWorkspace()
    const service = createAttachmentsService()

    const result = await service.saveAttachment({
      workspaceId: "ws_1",
      workspacePath: workspace,
      fileName: "shot.png",
      mimeType: "image/png",
      bytes: new Uint8Array([1, 2, 3]),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.descriptor.kind).toBe("image")
    expect(result.descriptor.size).toBe(3)
    expect(
      result.descriptor.path.startsWith(path.join(workspace, ".agent-server", "attachments")),
    ).toBe(true)
    const stored = await readFile(result.descriptor.path)
    expect([...stored]).toEqual([1, 2, 3])
  })

  test("infers file kind for non-image mime types", async () => {
    const workspace = await createTempWorkspace()
    const service = createAttachmentsService()

    const result = await service.saveAttachment({
      workspaceId: "ws_1",
      workspacePath: workspace,
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array(),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.descriptor.kind).toBe("file")
  })

  test("rejects executable extensions", async () => {
    const workspace = await createTempWorkspace()
    const service = createAttachmentsService()

    const result = await service.saveAttachment({
      workspaceId: "ws_1",
      workspacePath: workspace,
      fileName: "evil.exe",
      mimeType: "application/octet-stream",
      bytes: new Uint8Array(),
    })

    expect(result).toEqual({ ok: false, reason: "blocked-extension" })
  })
})

describe("resolveAttachment", () => {
  test("accepts a reference inside the attachments folder", async () => {
    const workspace = await createTempWorkspace()
    const service = createAttachmentsService()
    const saved = await service.saveAttachment({
      workspaceId: "ws_1",
      workspacePath: workspace,
      fileName: "shot.png",
      mimeType: "image/png",
      bytes: new Uint8Array([9]),
    })
    if (!saved.ok) throw new Error("save failed")

    expect(
      service.resolveAttachment({
        workspacePath: workspace,
        reference: {
          kind: "image",
          name: "shot.png",
          mimeType: "image/png",
          path: saved.descriptor.path,
        },
      }),
    ).resolves.toEqual({
      kind: "image",
      name: "shot.png",
      mimeType: "image/png",
      path: saved.descriptor.path,
    })
  })

  test("rejects a path escaping the attachments folder", async () => {
    const workspace = await createTempWorkspace()
    const service = createAttachmentsService()

    expect(
      service.resolveAttachment({
        workspacePath: workspace,
        reference: {
          kind: "file",
          name: "secret.txt",
          mimeType: "text/plain",
          path: path.join(workspace, "secret.txt"),
        },
      }),
    ).resolves.toBeNull()
  })

  test("rejects a path escaping via traversal", async () => {
    const workspace = await createTempWorkspace()
    const service = createAttachmentsService()

    expect(
      service.resolveAttachment({
        workspacePath: workspace,
        reference: {
          kind: "file",
          name: "x",
          mimeType: "text/plain",
          path: path.join(
            workspace,
            ".agent-server",
            "attachments",
            "..",
            "..",
            "..",
            "etc",
            "passwd",
          ),
        },
      }),
    ).resolves.toBeNull()
  })

  test("rejects a reference to a missing file", async () => {
    const workspace = await createTempWorkspace()
    const service = createAttachmentsService()

    expect(
      service.resolveAttachment({
        workspacePath: workspace,
        reference: {
          kind: "file",
          name: "gone.txt",
          mimeType: "text/plain",
          path: path.join(workspace, ".agent-server", "attachments", "att_missing.txt"),
        },
      }),
    ).resolves.toBeNull()
  })
})

describe("deleteAttachment", () => {
  test("removes the stored file by attachment id", async () => {
    const workspace = await createTempWorkspace()
    const service = createAttachmentsService()
    const saved = await service.saveAttachment({
      workspaceId: "ws_1",
      workspacePath: workspace,
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array([1]),
    })
    if (!saved.ok) throw new Error("save failed")
    const attachmentId = path.basename(saved.descriptor.path)

    expect(service.deleteAttachment({ workspacePath: workspace, attachmentId })).resolves.toBe(true)
    expect(
      service.resolveAttachment({
        workspacePath: workspace,
        reference: {
          kind: "file",
          name: "notes.md",
          mimeType: "text/markdown",
          path: saved.descriptor.path,
        },
      }),
    ).resolves.toBeNull()
  })

  test("rejects ids that are not attachment filenames", async () => {
    const workspace = await createTempWorkspace()
    const service = createAttachmentsService()

    expect(
      service.deleteAttachment({ workspacePath: workspace, attachmentId: "../escape.txt" }),
    ).resolves.toBe(false)
    expect(
      service.deleteAttachment({ workspacePath: workspace, attachmentId: "random.txt" }),
    ).resolves.toBe(false)
  })
})

describe("ensureGitignoreEntry", () => {
  test("appends the attachments path to an existing .gitignore", async () => {
    const workspace = await createTempWorkspace({ gitignore: "node_modules\n" })

    const result = await ensureGitignoreEntry(workspace)

    expect(result).toEqual({ patched: true, skipped: null })
    const content = await readFile(path.join(workspace, ".gitignore"), "utf8")
    expect(content).toBe("node_modules\n.agent-server/attachments/\n")
  })

  test("is idempotent when the entry already exists", async () => {
    const workspace = await createTempWorkspace({
      gitignore: "node_modules\n.agent-server/attachments/\n",
    })

    const result = await ensureGitignoreEntry(workspace)

    expect(result).toEqual({ patched: false, skipped: "already-present" })
    const content = await readFile(path.join(workspace, ".gitignore"), "utf8")
    expect(content).toBe("node_modules\n.agent-server/attachments/\n")
  })

  test("skips without creating a .gitignore when none exists", async () => {
    const workspace = await createTempWorkspace()

    const result = await ensureGitignoreEntry(workspace)

    expect(result).toEqual({ patched: false, skipped: "no-gitignore" })
    expect(readFile(path.join(workspace, ".gitignore"), "utf8")).rejects.toThrow()
  })

  test("inserts a separating newline when the file does not end with one", async () => {
    const workspace = await createTempWorkspace({ gitignore: "node_modules" })

    await ensureGitignoreEntry(workspace)

    const content = await readFile(path.join(workspace, ".gitignore"), "utf8")
    expect(content).toBe("node_modules\n.agent-server/attachments/\n")
  })
})

describe("kind helpers", () => {
  test("image mime maps to image kind", () => {
    expect(inferAttachmentKind("image/png")).toBe("image")
    expect(inferAttachmentKind("application/pdf")).toBe("file")
  })

  test("executable extensions are blocked case-insensitively", () => {
    expect(isBlockedAttachmentName("EVIL.EXE")).toBe(true)
    expect(isBlockedAttachmentName("report.pdf")).toBe(false)
  })
})
