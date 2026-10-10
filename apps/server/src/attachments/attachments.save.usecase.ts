import path from "node:path"
import {
  attachmentFileName,
  inferAttachmentKind,
  validateAttachmentFileName,
} from "./attachments.file.name"
import {
  CreateAttachmentId,
  EnsureAttachmentsDir,
  EnsureGitignoreEntry,
  SaveAttachment,
  WriteAttachmentBytes,
} from "./attachments.ports"

export type SaveAttachmentDeps = Readonly<{
  createAttachmentId: CreateAttachmentId
  ensureAttachmentsDir: EnsureAttachmentsDir
  writeAttachmentBytes: WriteAttachmentBytes
  ensureGitignoreEntry: EnsureGitignoreEntry
}>

export const makeSaveAttachment =
  (deps: SaveAttachmentDeps): SaveAttachment =>
  async (command) => {
    const nameCheck = validateAttachmentFileName(command.fileName)
    if (!nameCheck.ok) {
      return nameCheck
    }

    const id = deps.createAttachmentId()
    const attachmentsRoot = await deps.ensureAttachmentsDir(command.workspacePath)
    const filePath = path.join(
      attachmentsRoot,
      attachmentFileName({ id, originalFileName: command.fileName }),
    )

    await deps.writeAttachmentBytes({ filePath, bytes: command.bytes })
    await deps.ensureGitignoreEntry(command.workspacePath)

    return {
      ok: true,
      value: {
        id,
        name: command.fileName,
        mimeType: command.mimeType,
        kind: command.kind ?? inferAttachmentKind(command.mimeType),
        size: command.bytes.byteLength,
        path: filePath,
      },
    }
  }
