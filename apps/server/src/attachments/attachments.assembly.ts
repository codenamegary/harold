import { FastifyInstance } from "fastify"
import { FindWorkspaceById } from "core/workspace/ports"
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
import { registerAttachmentRoutes } from "./attachments.routes"
import { makeSaveAttachment } from "./attachments.save.usecase"

export type AssembleAttachmentsSliceDeps = Readonly<{
  findWorkspaceById: FindWorkspaceById
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

  return {
    registerRoutes: (app) => {
      registerAttachmentRoutes(app, {
        findWorkspaceById: deps.findWorkspaceById,
        saveAttachment,
        deleteAttachment,
      })
    },
    loadAttachment,
  }
}
