import { describe, expect, test } from "bun:test"
import path from "node:path"
import { makeSaveAttachment } from "./attachments.save.usecase"

const workspacePath = "/projects/app"
const attachmentsRoot = path.join(workspacePath, ".agent-server", "attachments")

const command = {
  workspaceId: "ws_1",
  workspacePath,
  fileName: "shot.png",
  mimeType: "image/png",
  bytes: new Uint8Array([1, 2, 3]),
} as const

const unreachable = (name: string) => () => {
  throw new Error(`${name} should not be called on this path`)
}

describe("save attachment", () => {
  test("writes the bytes under the attachments folder and returns a descriptor", async () => {
    const writes: Array<{ filePath: string; bytes: Uint8Array }> = []
    const ignoredWorkspaces: string[] = []
    const saveAttachment = makeSaveAttachment({
      createAttachmentId: () => "att_01JQ4KX7Q2M",
      ensureAttachmentsDir: async () => attachmentsRoot,
      writeAttachmentBytes: async (input) => {
        writes.push(input)
      },
      ensureGitignoreEntry: async (givenWorkspacePath) => {
        ignoredWorkspaces.push(givenWorkspacePath)
      },
    })

    const result = await saveAttachment(command)

    expect(result).toEqual({
      ok: true,
      value: {
        id: "att_01JQ4KX7Q2M",
        workspaceId: "ws_1",
        name: "shot.png",
        mimeType: "image/png",
        kind: "image",
        size: 3,
        path: path.join(attachmentsRoot, "att_01JQ4KX7Q2M.png"),
      },
    })
    expect(writes).toEqual([
      {
        filePath: path.join(attachmentsRoot, "att_01JQ4KX7Q2M.png"),
        bytes: command.bytes,
      },
    ])
    expect(ignoredWorkspaces).toEqual([workspacePath])
  })

  test("infers file kind for non-image mime types", async () => {
    const saveAttachment = makeSaveAttachment({
      createAttachmentId: () => "att_01JQ4KX7Q2M",
      ensureAttachmentsDir: async () => attachmentsRoot,
      writeAttachmentBytes: async () => undefined,
      ensureGitignoreEntry: async () => undefined,
    })

    const result = await saveAttachment({
      ...command,
      fileName: "notes.md",
      mimeType: "text/markdown",
      bytes: new Uint8Array(),
    })

    expect(result.ok && result.value.kind).toBe("file")
  })

  test("honours an explicit kind over the inferred one", async () => {
    const saveAttachment = makeSaveAttachment({
      createAttachmentId: () => "att_01JQ4KX7Q2M",
      ensureAttachmentsDir: async () => attachmentsRoot,
      writeAttachmentBytes: async () => undefined,
      ensureGitignoreEntry: async () => undefined,
    })

    const result = await saveAttachment({ ...command, kind: "file" })

    expect(result.ok && result.value.kind).toBe("file")
  })

  test("rejects a blank file name without touching the filesystem", async () => {
    const saveAttachment = makeSaveAttachment({
      createAttachmentId: unreachable("createAttachmentId"),
      ensureAttachmentsDir: unreachable("ensureAttachmentsDir"),
      writeAttachmentBytes: unreachable("writeAttachmentBytes"),
      ensureGitignoreEntry: unreachable("ensureGitignoreEntry"),
    })

    const result = await saveAttachment({ ...command, fileName: "  " })

    expect(result).toEqual({ ok: false, error: { kind: "empty_name" } })
  })

  test("rejects blocked extensions without touching the filesystem", async () => {
    const saveAttachment = makeSaveAttachment({
      createAttachmentId: unreachable("createAttachmentId"),
      ensureAttachmentsDir: unreachable("ensureAttachmentsDir"),
      writeAttachmentBytes: unreachable("writeAttachmentBytes"),
      ensureGitignoreEntry: unreachable("ensureGitignoreEntry"),
    })

    const result = await saveAttachment({ ...command, fileName: "evil.exe" })

    expect(result).toEqual({ ok: false, error: { kind: "blocked_extension" } })
  })
})
