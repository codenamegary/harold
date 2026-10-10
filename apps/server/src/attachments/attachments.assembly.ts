import { FastifyInstance } from "fastify"
import { CanonicalizePath } from "core/filesystem/ports"
import { createAttachmentId } from "./attachments.create.id"
import { makeDeleteAttachment } from "./attachments.delete.usecase"
import {
  makeDeleteAttachmentFile,
  makeEnsureAttachmentsDir,
  makeEnsureGitignoreEntry,
  makeReadAttachmentBytes,
  makeWriteAttachmentBytes,
} from "./attachments.fs.adapters"
import { makeLoadAttachment } from "./attachments.load.usecase"
import { LoadAttachment } from "./attachments.ports"
import { makeResolveSessionFolder } from "./attachments.resolve.session.folder.usecase"
import { registerAttachmentRoutes } from "./attachments.routes"
import { makeSaveAttachment } from "./attachments.save.usecase"

export type AssembleAttachmentsSliceDeps = Readonly<{
  findSessionCwd: (params: { agentId: string; sessionId: string }) => string | undefined
  canonicalizePath: CanonicalizePath
  getAllowedRoots: () => readonly string[]
}>

export type AttachmentsSlice = Readonly<{
  registerRoutes: (app: FastifyInstance) => void
  loadAttachment: LoadAttachment
}>

export const assembleAttachmentsSlice = (deps: AssembleAttachmentsSliceDeps): AttachmentsSlice => {
  const ensureAttachmentsDir = makeEnsureAttachmentsDir()
  const writeAttachmentBytes = makeWriteAttachmentBytes()
  const readAttachmentBytes = makeReadAttachmentBytes()
  const deleteAttachmentFile = makeDeleteAttachmentFile()
  const ensureGitignoreEntry = makeEnsureGitignoreEntry()

  const saveAttachment = makeSaveAttachment({
    createAttachmentId,
    ensureAttachmentsDir,
    writeAttachmentBytes,
    ensureGitignoreEntry,
  })
  const loadAttachment = makeLoadAttachment({
    ensureAttachmentsDir,
    readAttachmentBytes,
  })
  const deleteAttachment = makeDeleteAttachment({
    ensureAttachmentsDir,
    deleteAttachmentFile,
  })

  const resolveSessionFolder = makeResolveSessionFolder({
    findSessionCwd: deps.findSessionCwd,
    canonicalizePath: deps.canonicalizePath,
    getAllowedRoots: deps.getAllowedRoots,
  })

  return {
    registerRoutes: (app) => {
      registerAttachmentRoutes(app, {
        resolveSessionFolder,
        saveAttachment,
        deleteAttachment,
      })
    },
    loadAttachment,
  }
}
