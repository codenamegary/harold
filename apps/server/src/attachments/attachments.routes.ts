import {
  AttachmentDescriptorSchema,
  AttachmentDeleteParamsSchema,
  AttachmentKind,
  AttachmentKindSchema,
  AttachmentSessionParamsSchema,
  AttachmentSessionQuerySchema,
  MAX_ATTACHMENT_BYTES,
} from "contracts/http/attachments"
import { FastifyInstance } from "fastify"
import { MultipartFile } from "@fastify/multipart"
import { buildSessionNotFoundProblem } from "../session/session.problems"
import { DeleteAttachment, ResolveSessionFolder, SaveAttachment } from "./attachments.ports"
import {
  buildAttachmentFolderNotAllowedProblem,
  buildAttachmentNotFoundProblem,
  buildAttachmentParamsProblem,
  buildAttachmentTooLargeProblem,
  buildAttachmentTypeRejectedProblem,
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

export type AttachmentsRouteDeps = Readonly<{
  resolveSessionFolder: ResolveSessionFolder
  saveAttachment: SaveAttachment
  deleteAttachment: DeleteAttachment
}>

export const registerAttachmentRoutes = (app: FastifyInstance, deps: AttachmentsRouteDeps) => {
  const resolveFolder = (params: { agentId: string; sessionId: string }) => {
    const resolved = deps.resolveSessionFolder(params)
    if (resolved.ok) {
      return { ok: true as const, folder: resolved.value }
    }
    switch (resolved.error.kind) {
      case "outside_allowed_roots":
        return {
          ok: false as const,
          status: 409,
          problem: buildAttachmentFolderNotAllowedProblem(),
        }
      case "unknown_session":
      case "folder_unavailable":
        return { ok: false as const, status: 404, problem: buildSessionNotFoundProblem() }
    }
  }

  app.post("/v1/sessions/:sessionId/attachments", async (request, reply) => {
    const params = AttachmentSessionParamsSchema.safeParse(request.params)
    if (!params.success) {
      return sendProblem(reply, 400, buildAttachmentParamsProblem(params.error))
    }
    const query = AttachmentSessionQuerySchema.safeParse(request.query)
    if (!query.success) {
      return sendProblem(reply, 400, buildAttachmentParamsProblem(query.error))
    }
    const folder = resolveFolder({ agentId: query.data.agentId, sessionId: params.data.sessionId })
    if (!folder.ok) {
      return sendProblem(reply, folder.status, folder.problem)
    }

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
      return sendProblem(reply, 415, buildAttachmentTypeRejectedProblem("Missing file part"))
    }

    if (file.file.truncated) {
      return sendProblem(
        reply,
        413,
        buildAttachmentTooLargeProblem(`Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`),
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
        buildAttachmentTooLargeProblem(`Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`),
      )
    }

    const kind = parseKindField(file.fields.kind)

    const saved = await deps.saveAttachment({
      workspacePath: folder.folder,
      fileName: file.filename,
      mimeType,
      kind,
      bytes,
    })

    if (!saved.ok) {
      return sendProblem(
        reply,
        415,
        buildAttachmentTypeRejectedProblem(
          saved.error.kind === "blocked_extension"
            ? "Executable file types are not accepted"
            : "File name is required",
        ),
      )
    }

    return reply.status(201).send(AttachmentDescriptorSchema.parse(saved.value))
  })

  app.delete("/v1/sessions/:sessionId/attachments/:attachmentId", async (request, reply) => {
    const params = AttachmentDeleteParamsSchema.safeParse(request.params)
    if (!params.success) {
      return sendProblem(reply, 400, buildAttachmentParamsProblem(params.error))
    }
    const query = AttachmentSessionQuerySchema.safeParse(request.query)
    if (!query.success) {
      return sendProblem(reply, 400, buildAttachmentParamsProblem(query.error))
    }
    const { sessionId, attachmentId } = params.data
    const folder = resolveFolder({ agentId: query.data.agentId, sessionId })
    if (!folder.ok) {
      return sendProblem(reply, folder.status, folder.problem)
    }

    const deleted = await deps.deleteAttachment({
      workspacePath: folder.folder,
      attachmentId,
    })

    if (!deleted.ok) {
      return sendProblem(reply, 404, buildAttachmentNotFoundProblem())
    }

    return reply.status(204).send()
  })
}
