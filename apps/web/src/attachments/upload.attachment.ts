import {
  AttachmentDescriptorSchema,
  MAX_ATTACHMENT_BYTES,
} from "contracts/http/attachments"

export type UploadedAttachment = {
  id: string
  name: string
  mimeType: string
  kind: "image" | "file"
  size: number
  path: string
}

export type AttachmentUploadError = Error & { status: number }

export const isAttachmentUploadError = (error: unknown): error is AttachmentUploadError =>
  error instanceof Error && error.name === "AttachmentUploadError"

const attachmentUploadError = (message: string, status: number): AttachmentUploadError => {
  const error = new Error(message) as AttachmentUploadError
  error.name = "AttachmentUploadError"
  error.status = status
  return error
}


export const uploadAttachment = async (params: {
  workspaceId: string
  file: File
  kind?: "image" | "file"
}): Promise<UploadedAttachment> => {
  if (params.file.size > MAX_ATTACHMENT_BYTES) {
    throw attachmentUploadError(
      `Attachment exceeds ${MAX_ATTACHMENT_BYTES} bytes`,
      413,
    )
  }

  const form = new FormData()
  form.append("file", params.file, params.file.name)
  if (params.kind !== undefined) {
    form.append("kind", params.kind)
  }

  const response = await fetch(
    `/v1/workspaces/${encodeURIComponent(params.workspaceId)}/attachments`,
    { method: "POST", body: form },
  )

  if (!response.ok) {
    const detail =
      response.status === 413
        ? "Attachment is too large (20 MB limit)"
        : response.status === 415
          ? "This file type is not accepted"
          : `Upload failed (${response.status})`
    throw attachmentUploadError(detail, response.status)
  }

  const payload: unknown = await response.json()
  const descriptor = AttachmentDescriptorSchema.parse(payload)
  return {
    id: descriptor.id,
    name: descriptor.name,
    mimeType: descriptor.mimeType,
    kind: descriptor.kind,
    size: descriptor.size,
    path: descriptor.path,
  }
}

export const deleteUploadedAttachment = async (params: {
  workspaceId: string
  attachmentId: string
}): Promise<void> => {
  await fetch(
    `/v1/workspaces/${encodeURIComponent(params.workspaceId)}/attachments/${encodeURIComponent(params.attachmentId)}`,
    { method: "DELETE" },
  ).catch(() => undefined)
}
