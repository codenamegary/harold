import {
  AttachmentDescriptor,
  AttachmentKind,
  AttachmentReference,
} from "contracts/http/attachments"
import { DeleteAttachmentError, SaveAttachmentError } from "./attachments.errors"

export type SaveAttachmentCommand = Readonly<{
  workspacePath: string
  fileName: string
  mimeType: string
  bytes: Uint8Array
  kind?: AttachmentKind
}>

export type LoadAttachmentParams = Readonly<{
  workspacePath: string
  reference: AttachmentReference
}>

export type ResolvedAttachment = Readonly<{
  reference: AttachmentReference
  bytes: Uint8Array
}>

export type DeleteAttachmentParams = Readonly<{
  workspacePath: string
  attachmentId: string
}>

export type SaveAttachmentResult =
  | { ok: true; value: AttachmentDescriptor }
  | { ok: false; error: SaveAttachmentError }

export type DeleteAttachmentResult = { ok: true } | { ok: false; error: DeleteAttachmentError }
