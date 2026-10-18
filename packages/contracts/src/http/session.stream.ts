import { z } from "zod"
import { AgentAuthSchema } from "./agent-auth"
import { AgentId, AgentIdSchema } from "./agent-settings"
import { SessionConfigSchema } from "./config.options"
import { sessionPath } from "./session"

const agentQuery = (query: { agentId: AgentId }) => `?agentId=${encodeURIComponent(query.agentId)}`

export const sessionEventsPath = (sessionId: string, query: { agentId: AgentId }) =>
  `${sessionPath(sessionId)}/events${agentQuery(query)}`

export const sessionPromptsPath = (sessionId: string, query: { agentId: AgentId }) =>
  `${sessionPath(sessionId)}/prompts${agentQuery(query)}`

export const sessionCancelPath = (sessionId: string, query: { agentId: AgentId }) =>
  `${sessionPath(sessionId)}/cancel${agentQuery(query)}`

export const PERMISSIONS_PATH = "/v1/permissions" as const
export const EXTENSIONS_PATH = "/v1/extensions" as const

export const permissionRepliesPath = (requestId: string) =>
  `${PERMISSIONS_PATH}/${encodeURIComponent(requestId)}/replies`

export const extensionRepliesPath = (requestId: string) =>
  `${EXTENSIONS_PATH}/${encodeURIComponent(requestId)}/replies`

export const SessionCommandParamsSchema = z.strictObject({
  sessionId: z.string().min(1),
})

export const SessionCommandQuerySchema = z.strictObject({
  agentId: AgentIdSchema,
})

export const ReplyParamsSchema = z.strictObject({
  requestId: z.string().min(1),
})

/** REST body for POST /v1/permissions/:requestId/replies. */
export const PermissionReplyBodySchema = z.strictObject({
  optionId: z.string().min(1),
})

/** REST body for POST /v1/extensions/:requestId/replies. */
export const ExtensionReplyBodySchema = z.strictObject({
  result: z.unknown(),
})

export const SessionStreamSessionUpdateSchema = z.strictObject({
  type: z.literal("session_update"),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
  update: z.unknown(),
})

export const SessionStreamSessionConfigSchema = z.strictObject({
  type: z.literal("session_config"),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
  configOptions: SessionConfigSchema,
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

export const SessionStreamPromptCompleteSchema = z.strictObject({
  type: z.literal("prompt_complete"),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
})

export const SessionStreamCancelledSchema = z.strictObject({
  type: z.literal("cancelled"),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
})

export const SessionStreamAuthSessionUpdatedSchema = z.strictObject({
  type: z.literal("auth_session_updated"),
  agentId: AgentIdSchema,
  auth: AgentAuthSchema,
})

export const SessionStreamSessionInfoSchema = z.strictObject({
  type: z.literal("session_info"),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
  title: z.string().nullable(),
})

export const SessionStreamServerMessageSchema = z.discriminatedUnion("type", [
  SessionStreamSessionUpdateSchema,
  SessionStreamSessionConfigSchema,
  SessionStreamSubscribedSchema,
  SessionStreamPermissionRequestSchema,
  SessionStreamExtensionRequestSchema,
  SessionStreamErrorSchema,
  SessionStreamPromptCompleteSchema,
  SessionStreamCancelledSchema,
  SessionStreamAuthSessionUpdatedSchema,
  SessionStreamSessionInfoSchema,
])

export type SessionStreamServerMessage = z.infer<typeof SessionStreamServerMessageSchema>
export type PermissionReplyBody = z.infer<typeof PermissionReplyBodySchema>
export type ExtensionReplyBody = z.infer<typeof ExtensionReplyBodySchema>
export type SessionCommandParams = z.infer<typeof SessionCommandParamsSchema>
export type SessionCommandQuery = z.infer<typeof SessionCommandQuerySchema>
export type ReplyParams = z.infer<typeof ReplyParamsSchema>
