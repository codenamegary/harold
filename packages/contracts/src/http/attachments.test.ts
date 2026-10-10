import { describe, expect, test } from "bun:test"
import {
  AttachmentDescriptorSchema,
  AttachmentReferenceSchema,
  MAX_ATTACHMENTS_PER_PROMPT,
  MAX_ATTACHMENT_BYTES,
  attachmentsFolderName,
} from "./attachments"

const descriptor = {
  id: "att_01JQ4KX7Q2M",
  name: "screenshot.png",
  mimeType: "image/png",
  kind: "image",
  size: 419430,
  path: "/home/dev/proj/.harold/attachments/att_01JQ4KX7Q2M.png",
}

describe("AttachmentDescriptorSchema", () => {
  test("parses a full descriptor", () => {
    expect(AttachmentDescriptorSchema.parse(descriptor)).toEqual(descriptor)
  })

  test("does not carry a workspace id", () => {
    expect(
      AttachmentDescriptorSchema.safeParse({ ...descriptor, workspaceId: "ws_01HQ2WN8P9" }).success,
    ).toBe(false)
  })

  test("rejects unknown kind", () => {
    expect(AttachmentDescriptorSchema.safeParse({ ...descriptor, kind: "video" }).success).toBe(
      false,
    )
  })

  test("rejects negative size", () => {
    expect(AttachmentDescriptorSchema.safeParse({ ...descriptor, size: -1 }).success).toBe(false)
  })
})

describe("AttachmentReferenceSchema", () => {
  test("carries the descriptor fields a content block needs", () => {
    const reference = {
      kind: "image",
      name: descriptor.name,
      mimeType: descriptor.mimeType,
      path: descriptor.path,
    }
    expect(AttachmentReferenceSchema.parse(reference)).toEqual(reference)
  })

  test("rejects missing path", () => {
    expect(
      AttachmentReferenceSchema.safeParse({
        kind: "file",
        name: "notes.md",
        mimeType: "text/markdown",
      }).success,
    ).toBe(false)
  })

  test("rejects unknown kind", () => {
    expect(
      AttachmentReferenceSchema.safeParse({
        kind: "video",
        name: "clip.mp4",
        mimeType: "video/mp4",
        path: "/tmp/clip.mp4",
      }).success,
    ).toBe(false)
  })
})

describe("limits", () => {
  test("per-prompt cap is five", () => {
    expect(MAX_ATTACHMENTS_PER_PROMPT).toBe(5)
  })

  test("size cap is twenty megabytes", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(20 * 1024 * 1024)
  })

  test("storage folder is dot-prefixed inside the session folder", () => {
    expect(attachmentsFolderName).toBe(".harold/attachments")
  })
})
