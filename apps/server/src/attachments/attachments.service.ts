import { readFile, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { ulid } from "ulid"
import {
  AttachmentDescriptor,
  AttachmentKind,
  AttachmentReference,
  BLOCKED_ATTACHMENT_EXTENSIONS,
} from "contracts/http/attachments"
import { isPathUnderAllowedRoot } from "../workspace/workspace.is.path.under.allowed.root"
import { ensureAttachmentsDir, ensureGitignoreEntry } from "./gitignore"

const ATTACHMENT_ID_PREFIX = "att_"
const ATTACHMENT_FILENAME_PATTERN = /^att_[0-9A-HJKMNP-TV-Za-z0-9]+\.[A-Za-z0-9]+$/

export const inferAttachmentKind = (mimeType: string): AttachmentKind =>
  mimeType.startsWith("image/") ? "image" : "file"

export const isBlockedAttachmentName = (fileName: string): boolean => {
  const lower = fileName.toLowerCase()
  return BLOCKED_ATTACHMENT_EXTENSIONS.some((extension) =>
    lower.endsWith(extension),
  )
}

export type SaveAttachmentParams = {
  workspaceId: string
  workspacePath: string
  fileName: string
  mimeType: string
  bytes: Uint8Array
  kind?: AttachmentKind
}

export type AttachmentValidationError =
  | "blocked-extension"
  | "empty-name"

export type ResolveAttachmentParams = {
  workspacePath: string
  reference: AttachmentReference
}

export type CreateAttachmentsServiceParams = {
  now?: () => Date
}

export const createAttachmentsService = (
  params: CreateAttachmentsServiceParams = {},
) => {
  const now = params.now ?? (() => new Date())

  const validateFileName = (
    fileName: string,
  ): { ok: true } | { ok: false; reason: AttachmentValidationError } => {
    if (fileName.trim().length === 0) {
      return { ok: false, reason: "empty-name" }
    }
    if (isBlockedAttachmentName(fileName)) {
      return { ok: false, reason: "blocked-extension" }
    }
    return { ok: true }
  }

  const saveAttachment = async (
    saveParams: SaveAttachmentParams,
  ): Promise<
    | { ok: true; descriptor: AttachmentDescriptor }
    | { ok: false; reason: AttachmentValidationError }
  > => {
    const fileNameCheck = validateFileName(saveParams.fileName)
    if (!fileNameCheck.ok) {
      return fileNameCheck
    }

    const id = `${ATTACHMENT_ID_PREFIX}${ulid()}`
    const extension = path.extname(saveParams.fileName)
    const fileName = `${id}${extension}`
    const dir = await ensureAttachmentsDir(saveParams.workspacePath)
    const filePath = path.join(dir, fileName)
    await writeFile(filePath, saveParams.bytes)
    await ensureGitignoreEntry(saveParams.workspacePath)

    const kind: AttachmentKind =
      saveParams.kind ?? inferAttachmentKind(saveParams.mimeType)

    return {
      ok: true,
      descriptor: {
        id,
        workspaceId: saveParams.workspaceId,
        name: saveParams.fileName,
        mimeType: saveParams.mimeType,
        kind,
        size: saveParams.bytes.byteLength,
        path: filePath,
      },
    }
  }

  /**
   * The prompt reference echoes client-supplied descriptor fields, so the
   * server re-validates before mapping to a content block: the path must
   * resolve inside this workspace's attachments folder and the file must
   * exist. Returns the reference with its bytes for content-block embedding.
   */
  const loadAttachment = async ({
    workspacePath,
    reference,
  }: ResolveAttachmentParams): Promise<{
    reference: AttachmentReference
    bytes: Uint8Array
  } | null> => {
    const attachmentsRoot = await ensureAttachmentsDir(workspacePath)
    const resolved = path.resolve(reference.path)
    if (!isPathUnderAllowedRoot({ allowedRoot: attachmentsRoot, candidatePath: resolved })) {
      return null
    }
    try {
      const info = await stat(resolved)
      if (!info.isFile()) {
        return null
      }
    } catch {
      return null
    }
    const bytes = new Uint8Array(await readFile(resolved))
    return { reference: { ...reference, path: resolved }, bytes }
  }

  const deleteAttachment = async (params: {
    workspacePath: string
    attachmentId: string
  }): Promise<boolean> => {
    if (!ATTACHMENT_FILENAME_PATTERN.test(params.attachmentId)) {
      return false
    }
    const attachmentsRoot = await ensureAttachmentsDir(params.workspacePath)
    const filePath = path.join(attachmentsRoot, params.attachmentId)
    const resolved = path.resolve(filePath)
    if (!isPathUnderAllowedRoot({ allowedRoot: attachmentsRoot, candidatePath: resolved })) {
      return false
    }
    try {
      await unlink(resolved)
      return true
    } catch {
      return false
    }
  }

  const readGitignoreState = async (workspacePath: string) => {
    try {
      return await readFile(path.join(workspacePath, ".gitignore"), "utf8")
    } catch {
      return null
    }
  }

  return {
    saveAttachment,
    resolveAttachment: async (params: ResolveAttachmentParams) => {
      const loaded = await loadAttachment(params)
      return loaded?.reference ?? null
    },
    loadAttachment,
    deleteAttachment,
    validateFileName,
    readGitignoreState,
    now,
  }
}

export type AttachmentsService = ReturnType<typeof createAttachmentsService>
