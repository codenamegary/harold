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
export const ELICITATIONS_PATH = "/v1/elicitations" as const

export const permissionRepliesPath = (requestId: string) =>
  `${PERMISSIONS_PATH}/${encodeURIComponent(requestId)}/replies`

export const extensionRepliesPath = (requestId: string) =>
  `${EXTENSIONS_PATH}/${encodeURIComponent(requestId)}/replies`

export const elicitationRepliesPath = (requestId: string) =>
  `${ELICITATIONS_PATH}/${encodeURIComponent(requestId)}/replies`

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

/**
 * REST body for POST /v1/elicitations/:requestId/replies. The server forwards
 * `result` to the agent untouched, so it carries the raw ACP response:
 * `{ action: "accept" | "decline" | "cancel", content?: unknown }`.
 */
export const ElicitationReplyBodySchema = z.strictObject({
  result: z.unknown(),
})

export const ElicitationResolvedReasonSchema = z.enum([
  "replied",
  "timed_out",
  "session_cancelled",
  "agent_exited",
  "cancelled_by_agent",
])

export const SessionStreamSessionUpdateSchema = z.strictObject({
  type: z.literal("session_update"),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
  update: z.unknown(),
})

/**
 * Marker sent before a full replay. A client that resumes from a valid cursor
 * never sees it; when it arrives, the client discards its cached transcript
 * and rebuilds from the following events.
 */
export const SessionStreamResetSchema = z.strictObject({
  type: z.literal("stream_reset"),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
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

export const SessionStreamElicitationRequestSchema = z.strictObject({
  type: z.literal("elicitation_request"),
  requestId: z.string().min(1),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
  params: z.unknown(),
  /** Transport metadata only. The UI never displays it. */
  expiresAt: z.string().min(1),
})

export const SessionStreamElicitationResolvedSchema = z.strictObject({
  type: z.literal("elicitation_resolved"),
  requestId: z.string().min(1),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
  reason: ElicitationResolvedReasonSchema,
  result: z.unknown().optional(),
})

export const SessionStreamElicitationCompletedSchema = z.strictObject({
  type: z.literal("elicitation_completed"),
  elicitationId: z.string().min(1),
  requestId: z.string().min(1),
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
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
  SessionStreamResetSchema,
  SessionStreamSessionConfigSchema,
  SessionStreamSubscribedSchema,
  SessionStreamPermissionRequestSchema,
  SessionStreamExtensionRequestSchema,
  SessionStreamElicitationRequestSchema,
  SessionStreamElicitationResolvedSchema,
  SessionStreamElicitationCompletedSchema,
  SessionStreamErrorSchema,
  SessionStreamPromptCompleteSchema,
  SessionStreamCancelledSchema,
  SessionStreamAuthSessionUpdatedSchema,
  SessionStreamSessionInfoSchema,
])

export type SessionStreamServerMessage = z.infer<typeof SessionStreamServerMessageSchema>
export type PermissionReplyBody = z.infer<typeof PermissionReplyBodySchema>
export type ExtensionReplyBody = z.infer<typeof ExtensionReplyBodySchema>
export type ElicitationReplyBody = z.infer<typeof ElicitationReplyBodySchema>
export type ElicitationResolvedReason = z.infer<typeof ElicitationResolvedReasonSchema>
export type SessionCommandParams = z.infer<typeof SessionCommandParamsSchema>
export type SessionCommandQuery = z.infer<typeof SessionCommandQuerySchema>
export type ReplyParams = z.infer<typeof ReplyParamsSchema>
