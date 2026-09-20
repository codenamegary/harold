import { describe, expect, test } from "bun:test"
import path from "node:path"
import { makeLoadAttachment } from "./attachments.load.usecase"

const workspacePath = "/projects/app"
const attachmentsRoot = path.join(workspacePath, ".agent-server", "attachments")

const reference = {
  kind: "image",
  name: "shot.png",
  mimeType: "image/png",
  path: path.join(attachmentsRoot, "att_01JQ4KX7Q2M.png"),
} as const

const unreachable = (name: string) => () => {
  throw new Error(`${name} should not be called on this path`)
}

describe("load attachment", () => {
  test("returns the reference with bytes when the file sits inside the attachments folder", async () => {
    const bytes = new Uint8Array([7, 8, 9])
    const loadAttachment = makeLoadAttachment({
      ensureAttachmentsDir: async () => attachmentsRoot,
      readAttachmentBytes: async (filePath) => {
        expect(filePath).toBe(reference.path)
        return bytes
      },
    })

    const result = await loadAttachment({ workspacePath, reference })

    expect(result).toEqual({ reference, bytes })
  })

  test("normalizes a relative reference path before reading", async () => {
    const loadAttachment = makeLoadAttachment({
      ensureAttachmentsDir: async () => attachmentsRoot,
      readAttachmentBytes: async (filePath) => {
        expect(filePath).toBe(reference.path)
        return new Uint8Array([1])
      },
    })

    const result = await loadAttachment({
      workspacePath,
      reference: {
        ...reference,
        path: path.join(attachmentsRoot, "nested", "..", "att_01JQ4KX7Q2M.png"),
      },
    })

    expect(result?.reference.path).toBe(reference.path)
  })

  test("rejects a path outside the attachments folder without reading", async () => {
    const loadAttachment = makeLoadAttachment({
      ensureAttachmentsDir: async () => attachmentsRoot,
      readAttachmentBytes: unreachable("readAttachmentBytes"),
    })

    const result = await loadAttachment({
      workspacePath,
      reference: { ...reference, path: path.join(workspacePath, "secret.txt") },
    })

    expect(result).toBeNull()
  })

  test("rejects a path escaping the attachments folder via traversal", async () => {
    const loadAttachment = makeLoadAttachment({
      ensureAttachmentsDir: async () => attachmentsRoot,
      readAttachmentBytes: unreachable("readAttachmentBytes"),
    })

    const result = await loadAttachment({
      workspacePath,
      reference: {
        ...reference,
        path: path.join(attachmentsRoot, "..", "..", "..", "etc", "passwd"),
      },
    })

    expect(result).toBeNull()
  })

  test("returns null when the file cannot be read", async () => {
    const loadAttachment = makeLoadAttachment({
      ensureAttachmentsDir: async () => attachmentsRoot,
      readAttachmentBytes: async () => null,
    })

    const result = await loadAttachment({ workspacePath, reference })

    expect(result).toBeNull()
  })
})
