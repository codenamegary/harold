import { describe, expect, test } from "bun:test"
import { createAttachmentId } from "./attachments.create.id"

describe("createAttachmentId", () => {
  test("prefixes a ULID with att_", () => {
    expect(createAttachmentId()).toMatch(/^att_[0-9A-HJKMNP-TV-Z]{26}$/)
  })
})
