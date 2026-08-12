import { z } from "zod"
import { AgentIdSchema } from "./agent-settings"

export const SessionStreamSubscribeSchema = z.strictObject({
  type: z.literal("subscribe"),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
})

export const SessionStreamSwitchSchema = z.strictObject({
  type: z.literal("switch"),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
})

export const SessionStreamPromptSchema = z.strictObject({
  type: z.literal("prompt"),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
  text: z.string().min(1).max(32_768),
})

export const SessionStreamCancelSchema = z.strictObject({
  type: z.literal("cancel"),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
})

export const SessionStreamPermissionReplySchema = z.strictObject({
  type: z.literal("permission_reply"),
  requestId: z.string().min(1),
  optionId: z.string().min(1),
})

export const SessionStreamExtensionReplySchema = z.strictObject({
  type: z.literal("extension_reply"),
  requestId: z.string().min(1),
  result: z.unknown(),
})

export const SessionStreamClientMessageSchema = z.discriminatedUnion("type", [
  SessionStreamSubscribeSchema,
  SessionStreamSwitchSchema,
  SessionStreamPromptSchema,
  SessionStreamCancelSchema,
  SessionStreamPermissionReplySchema,
  SessionStreamExtensionReplySchema,
])

export const SessionStreamSessionUpdateSchema = z.strictObject({
  type: z.literal("session_update"),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
  update: z.unknown(),
})

export const SessionStreamSubscribedSchema = z.strictObject({
  type: z.literal("subscribed"),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
})

export const SessionStreamPermissionRequestSchema = z.strictObject({
  type: z.literal("permission_request"),
  requestId: z.string().min(1),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
  params: z.unknown(),
})

export const SessionStreamExtensionRequestSchema = z.strictObject({
  type: z.literal("extension_request"),
  requestId: z.string().min(1),
  method: z.string().min(1),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
  params: z.unknown(),
})

export const SessionStreamErrorSchema = z.strictObject({
  type: z.literal("error"),
  message: z.string().min(1),
  agentId: AgentIdSchema.optional(),
  sessionId: z.string().min(1).optional(),
})

export const SessionStreamServerMessageSchema = z.discriminatedUnion("type", [
  SessionStreamSessionUpdateSchema,
  SessionStreamSubscribedSchema,
  SessionStreamPermissionRequestSchema,
  SessionStreamExtensionRequestSchema,
  SessionStreamErrorSchema,
])

export type SessionStreamClientMessage = z.infer<typeof SessionStreamClientMessageSchema>
export type SessionStreamServerMessage = z.infer<typeof SessionStreamServerMessageSchema>
