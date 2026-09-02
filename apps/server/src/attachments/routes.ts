import { AttachmentKindSchema, MAX_ATTACHMENT_BYTES, AttachmentKind } from "contracts/http/attachments"
import { FastifyInstance } from "fastify"
import { MultipartFile } from "@fastify/multipart"
import { WorkspaceRepository } from "../workspace/repository"
import { AttachmentsService } from "./attachments.service"
import {
  buildAttachmentNotFoundProblem,
  buildAttachmentTooLargeProblem,
  buildAttachmentTypeRejectedProblem,
  buildWorkspaceNotFoundProblem,
} from "./attachments.problems"

const sendProblem = (
  reply: {
    status: (code: number) => {
      type: (type: string) => { send: (body: unknown) => unknown }
    }
  },
  status: number,
  problem: unknown,
) => reply.status(status).type("application/problem+json").send(problem)

const parseKindField = (value: unknown): AttachmentKind | undefined => {
  if (typeof value !== "string") {
    return undefined
  }
  const parsed = AttachmentKindSchema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

export const registerAttachmentRoutes = (
  app: FastifyInstance,
  workspaceRepository: WorkspaceRepository,
  attachmentsService: AttachmentsService,
) => {
  app.post("/v1/workspaces/:workspaceId/attachments", async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string }
    const workspaceResult = workspaceRepository.getById({ id: workspaceId })

    if (!workspaceResult.ok) {
      return sendProblem(reply, 404, buildWorkspaceNotFoundProblem())
    }
    const workspace = workspaceResult.value

    let file: MultipartFile | undefined
    try {
      file = await request.file()
    } catch {
      return sendProblem(
        reply,
        415,
        buildAttachmentTypeRejectedProblem("Expected multipart/form-data with a file part"),
      )
    }

    if (file === undefined) {
      return sendProblem(
        reply,
        415,
        buildAttachmentTypeRejectedProblem("Missing file part"),
      )
    }

    if (file.file.truncated) {
      return sendProblem(
        reply,
        413,
        buildAttachmentTooLargeProblem(
          `Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`,
        ),
      )
    }

    const mimeType = file.mimetype
    if (mimeType.length === 0) {
      return sendProblem(
        reply,
        415,
        buildAttachmentTypeRejectedProblem("Missing mime type on file part"),
      )
    }

    let bytes: Buffer
    try {
      bytes = await file.toBuffer()
    } catch {
      return sendProblem(
        reply,
        413,
        buildAttachmentTooLargeProblem(
          `Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`,
        ),
      )
    }

    const kindField = parseKindField(file.fields.kind)

    const saved = await attachmentsService.saveAttachment({
      workspaceId,
      workspacePath: workspace.path,
      fileName: file.filename,
      mimeType,
      kind: kindField,
      bytes,
    })

    if (!saved.ok) {
      return sendProblem(
        reply,
        415,
        buildAttachmentTypeRejectedProblem(
          saved.reason === "blocked-extension"
            ? "Executable file types are not accepted"
            : "File name is required",
        ),
      )
    }

    return reply.status(201).send(saved.descriptor)
  })

  app.delete("/v1/workspaces/:workspaceId/attachments/:attachmentId", async (request, reply) => {
    const { workspaceId, attachmentId } = request.params as {
      workspaceId: string
      attachmentId: string
    }
    const workspaceResult = workspaceRepository.getById({ id: workspaceId })

    if (!workspaceResult.ok) {
      return sendProblem(reply, 404, buildWorkspaceNotFoundProblem())
    }

    const deleted = await attachmentsService.deleteAttachment({
      workspacePath: workspaceResult.value.path,
      attachmentId,
    })

    if (!deleted) {
      return sendProblem(reply, 404, buildAttachmentNotFoundProblem())
    }

    return reply.status(204).send()
  })
}
