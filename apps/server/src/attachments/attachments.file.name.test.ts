import { describe, expect, test } from "bun:test"
import {
  attachmentFileName,
  inferAttachmentKind,
  isAttachmentFileName,
  isBlockedAttachmentName,
  validateAttachmentFileName,
} from "./attachments.file.name"

describe("inferAttachmentKind", () => {
  test("maps image mime types to image", () => {
    expect(inferAttachmentKind("image/png")).toBe("image")
    expect(inferAttachmentKind("image/jpeg")).toBe("image")
  })

  test("maps everything else to file", () => {
    expect(inferAttachmentKind("application/pdf")).toBe("file")
    expect(inferAttachmentKind("text/markdown")).toBe("file")
  })
})

describe("isBlockedAttachmentName", () => {
  test("blocks executable extensions case-insensitively", () => {
    expect(isBlockedAttachmentName("evil.exe")).toBe(true)
    expect(isBlockedAttachmentName("EVIL.EXE")).toBe(true)
  })

  test("allows ordinary files", () => {
    expect(isBlockedAttachmentName("report.pdf")).toBe(false)
  })
})

describe("validateAttachmentFileName", () => {
  test("accepts ordinary file names", () => {
    expect(validateAttachmentFileName("report.pdf")).toEqual({ ok: true })
  })

  test("rejects blank names", () => {
    expect(validateAttachmentFileName("   ")).toEqual({
      ok: false,
      error: { kind: "empty_name" },
    })
  })

  test("rejects blocked extensions", () => {
    expect(validateAttachmentFileName("evil.exe")).toEqual({
      ok: false,
      error: { kind: "blocked_extension" },
    })
  })
})

describe("isAttachmentFileName", () => {
  test("accepts generated attachment names", () => {
    expect(isAttachmentFileName("att_01JQ4KX7Q2M7Q2M7Q2M7Q2M7Q.png")).toBe(true)
  })

  test("rejects other names", () => {
    expect(isAttachmentFileName("random.txt")).toBe(false)
    expect(isAttachmentFileName("../escape.txt")).toBe(false)
    expect(isAttachmentFileName("att_01JQ4KX7Q2M7Q2M7Q2M7Q2M7Q")).toBe(false)
  })
})

describe("attachmentFileName", () => {
  test("appends the original extension to the generated id", () => {
    expect(
      attachmentFileName({ id: "att_01JQ4KX7Q2M", originalFileName: "report.final.pdf" }),
    ).toBe("att_01JQ4KX7Q2M.pdf")
  })

  test("keeps the generated id alone when the original has no extension", () => {
    expect(attachmentFileName({ id: "att_01JQ4KX7Q2M", originalFileName: "README" })).toBe(
      "att_01JQ4KX7Q2M",
    )
  })
})
