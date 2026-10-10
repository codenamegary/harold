import { ResolveSessionFolderError } from "./attachments.errors"
import {
  DeleteAttachmentParams,
  DeleteAttachmentResult,
  LoadAttachmentParams,
  ResolvedAttachment,
  SaveAttachmentCommand,
  SaveAttachmentResult,
} from "./attachments.models"

export type EnsureAttachmentsDir = (workspacePath: string) => Promise<string>

export type WriteAttachmentBytes = (input: { filePath: string; bytes: Uint8Array }) => Promise<void>

export type ReadAttachmentBytes = (filePath: string) => Promise<Uint8Array | null>

export type DeleteAttachmentFile = (filePath: string) => Promise<boolean>

export type EnsureGitignoreEntry = (workspacePath: string) => Promise<void>

export type CreateAttachmentId = () => string

export type SaveAttachment = (command: SaveAttachmentCommand) => Promise<SaveAttachmentResult>

export type LoadAttachment = (params: LoadAttachmentParams) => Promise<ResolvedAttachment | null>

export type DeleteAttachment = (params: DeleteAttachmentParams) => Promise<DeleteAttachmentResult>

export type ResolveSessionFolder = (params: {
  agentId: string
  sessionId: string
}) => { ok: true; value: string } | { ok: false; error: ResolveSessionFolderError }
