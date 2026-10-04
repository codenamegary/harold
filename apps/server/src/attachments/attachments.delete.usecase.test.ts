import { describe, expect, test } from "bun:test"
import path from "node:path"
import { makeDeleteAttachment } from "./attachments.delete.usecase"

const workspacePath = "/projects/app"
const attachmentsRoot = path.join(workspacePath, ".harold", "attachments")
const attachmentId = "att_01JQ4KX7Q2M.png"

const unreachable = (name: string) => () => {
  throw new Error(`${name} should not be called on this path`)
}

describe("delete attachment", () => {
  test("removes the file when the id names a stored attachment", async () => {
    const deletedPaths: string[] = []
    const deleteAttachment = makeDeleteAttachment({
      ensureAttachmentsDir: async () => attachmentsRoot,
      deleteAttachmentFile: async (filePath) => {
        deletedPaths.push(filePath)
        return true
      },
    })

    const result = await deleteAttachment({ workspacePath, attachmentId })

    expect(result).toEqual({ ok: true })
    expect(deletedPaths).toEqual([path.join(attachmentsRoot, attachmentId)])
  })

  test("rejects ids that are not attachment filenames without touching the filesystem", async () => {
    const deleteAttachment = makeDeleteAttachment({
      ensureAttachmentsDir: unreachable("ensureAttachmentsDir"),
      deleteAttachmentFile: unreachable("deleteAttachmentFile"),
    })

    expect(await deleteAttachment({ workspacePath, attachmentId: "../escape.txt" })).toEqual({
      ok: false,
      error: { kind: "invalid_attachment_id" },
    })
    expect(await deleteAttachment({ workspacePath, attachmentId: "random.txt" })).toEqual({
      ok: false,
      error: { kind: "invalid_attachment_id" },
    })
  })

  test("returns not_found when the file is already gone", async () => {
    const deleteAttachment = makeDeleteAttachment({
      ensureAttachmentsDir: async () => attachmentsRoot,
      deleteAttachmentFile: async () => false,
    })

    const result = await deleteAttachment({ workspacePath, attachmentId })

    expect(result).toEqual({ ok: false, error: { kind: "not_found" } })
  })
})
