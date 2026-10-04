import { z } from "zod"
import { IdSchema } from "./primitives"

export const AttachmentKindSchema = z.enum(["image", "file"])

export const AttachmentDescriptorSchema = z.strictObject({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  mimeType: z.string().min(1),
  kind: AttachmentKindSchema,
  size: z.number().int().nonnegative(),
  path: z.string().min(1),
})

/**
 * Prompt-carryable reference. The client echoes the descriptor fields it got
 * from the upload response — no server-side lookup; the server re-validates
 * the path before mapping to a content block.
 */
export const AttachmentReferenceSchema = z.strictObject({
  kind: AttachmentKindSchema,
  name: z.string().min(1),
  mimeType: z.string().min(1),
  path: z.string().min(1),
})

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024
export const MAX_ATTACHMENTS_PER_PROMPT = 5

/** Extensions the server refuses to store. */
export const BLOCKED_ATTACHMENT_EXTENSIONS = [
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bat",
  ".cmd",
  ".msi",
  ".scr",
  ".com",
] as const

export const attachmentsFolderName = ".harold/attachments"

export const AttachmentWorkspaceIdParamsSchema = z.strictObject({
  workspaceId: IdSchema,
})

export const AttachmentDeleteParamsSchema = AttachmentWorkspaceIdParamsSchema.extend({
  attachmentId: IdSchema,
})

export type AttachmentKind = z.infer<typeof AttachmentKindSchema>
export type AttachmentDescriptor = z.infer<typeof AttachmentDescriptorSchema>
export type AttachmentReference = z.infer<typeof AttachmentReferenceSchema>
export type AttachmentWorkspaceIdParams = z.infer<typeof AttachmentWorkspaceIdParamsSchema>
export type AttachmentDeleteParams = z.infer<typeof AttachmentDeleteParamsSchema>
