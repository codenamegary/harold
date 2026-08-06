import { z } from "zod"
import { createCollectionSchema } from "./collection"
import { IdSchema } from "./primitives"
import { TurnIdSchema } from "../events/primitives"

export const PermissionOptionKindSchema = z.enum(["allow", "deny", "other"])

export const PermissionOptionSchema = z.strictObject({
  optionId: z.string().min(1),
  name: z.string().min(1),
  kind: PermissionOptionKindSchema.optional(),
})

export const PermissionStatusSchema = z.enum(["pending", "resolved"])

export const PermissionRequestSchema = z.strictObject({
  id: IdSchema,
  sessionId: IdSchema,
  turnId: TurnIdSchema,
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  status: PermissionStatusSchema,
  options: z.array(PermissionOptionSchema).min(1),
  createdAt: z.string().min(1),
})

export const PermissionRequestCollectionSchema = createCollectionSchema(PermissionRequestSchema)

export const ListSessionPermissionsQuerySchema = z.strictObject({
  status: z.literal("pending").optional(),
})

export const ResolvePermissionRequestBodySchema = z.strictObject({
  status: z.literal("resolved"),
  optionId: z.string().min(1),
})

export const ResolvePermissionRequestResponseSchema = PermissionRequestSchema

export type PermissionOptionKind = z.infer<typeof PermissionOptionKindSchema>
export type PermissionOption = z.infer<typeof PermissionOptionSchema>
export type PermissionStatus = z.infer<typeof PermissionStatusSchema>
export type PermissionRequest = z.infer<typeof PermissionRequestSchema>
export type PermissionRequestCollection = z.infer<typeof PermissionRequestCollectionSchema>
export type ListSessionPermissionsQuery = z.infer<typeof ListSessionPermissionsQuerySchema>
export type ResolvePermissionRequestBody = z.infer<typeof ResolvePermissionRequestBodySchema>
export type ResolvePermissionRequestResponse = z.infer<typeof ResolvePermissionRequestResponseSchema>
