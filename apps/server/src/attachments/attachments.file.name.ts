import path from "node:path"
import { AttachmentKind, BLOCKED_ATTACHMENT_EXTENSIONS } from "contracts/http/attachments"
import { SaveAttachmentError } from "./attachments.errors"

export const ATTACHMENT_ID_PREFIX = "att_"

const attachmentFileNamePattern = /^att_[0-9A-HJKMNP-TV-Za-z0-9]+\.[A-Za-z0-9]+$/

export const isAttachmentFileName = (fileName: string): boolean =>
  attachmentFileNamePattern.test(fileName)

export const inferAttachmentKind = (mimeType: string): AttachmentKind =>
  mimeType.startsWith("image/") ? "image" : "file"

export const isBlockedAttachmentName = (fileName: string): boolean => {
  const lower = fileName.toLowerCase()
  return BLOCKED_ATTACHMENT_EXTENSIONS.some((extension) => lower.endsWith(extension))
}

export const validateAttachmentFileName = (
  fileName: string,
): { ok: true } | { ok: false; error: SaveAttachmentError } => {
  if (fileName.trim().length === 0) {
    return { ok: false, error: { kind: "empty_name" } }
  }
  if (isBlockedAttachmentName(fileName)) {
    return { ok: false, error: { kind: "blocked_extension" } }
  }
  return { ok: true }
}

export const attachmentFileName = (params: { id: string; originalFileName: string }): string =>
  `${params.id}${path.extname(params.originalFileName)}`
