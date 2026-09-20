import path from "node:path"
import { isDescendantOf } from "../filesystem/filesystem.is.descendant.of"
import { isAttachmentFileName } from "./attachments.file.name"
import { DeleteAttachment, DeleteAttachmentFile, EnsureAttachmentsDir } from "./attachments.ports"

export type DeleteAttachmentDeps = Readonly<{
  ensureAttachmentsDir: EnsureAttachmentsDir
  deleteAttachmentFile: DeleteAttachmentFile
}>

export const makeDeleteAttachment =
  (deps: DeleteAttachmentDeps): DeleteAttachment =>
  async ({ workspacePath, attachmentId }) => {
    if (!isAttachmentFileName(attachmentId)) {
      return { ok: false, error: { kind: "invalid_attachment_id" } }
    }

    const attachmentsRoot = await deps.ensureAttachmentsDir(workspacePath)
    const filePath = path.resolve(path.join(attachmentsRoot, attachmentId))

    if (!isDescendantOf({ path: attachmentsRoot, candidatePath: filePath })) {
      return { ok: false, error: { kind: "invalid_attachment_id" } }
    }

    const deleted = await deps.deleteAttachmentFile(filePath)
    if (!deleted) {
      return { ok: false, error: { kind: "not_found" } }
    }

    return { ok: true }
  }
