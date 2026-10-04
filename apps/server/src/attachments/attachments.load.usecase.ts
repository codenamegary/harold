import path from "node:path"
import { isDescendantOf } from "core/filesystem/is.descendant.of"
import { EnsureAttachmentsDir, LoadAttachment, ReadAttachmentBytes } from "./attachments.ports"

export type LoadAttachmentDeps = Readonly<{
  ensureAttachmentsDir: EnsureAttachmentsDir
  readAttachmentBytes: ReadAttachmentBytes
}>

/**
 * The prompt reference echoes client-supplied descriptor fields, so the server
 * re-validates before mapping to a content block: the path must resolve inside
 * this workspace's attachments folder and the file must exist. Returns the
 * reference with its bytes for content-block embedding, or null when rejected.
 */
export const makeLoadAttachment =
  (deps: LoadAttachmentDeps): LoadAttachment =>
  async ({ workspacePath, reference }) => {
    const attachmentsRoot = await deps.ensureAttachmentsDir(workspacePath)
    const resolvedPath = path.resolve(reference.path)

    if (!isDescendantOf({ path: attachmentsRoot, candidatePath: resolvedPath })) {
      return null
    }

    const bytes = await deps.readAttachmentBytes(resolvedPath)
    if (bytes === null) {
      return null
    }

    return { reference: { ...reference, path: resolvedPath }, bytes }
  }
