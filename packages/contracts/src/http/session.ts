import { z } from "zod"
import { AttachmentReferenceSchema, MAX_ATTACHMENTS_PER_PROMPT } from "./attachments"
import { TurnIdSchema } from "../events/primitives"
import { AgentId, AgentIdSchema } from "./agent-settings"
import { SessionConfigSchema } from "./config.options"
import { IdSchema, TimestampSchema } from "./primitives"

export const SESSIONS_PATH = "/v1/sessions" as const

export const sessionPath = (sessionId: string) =>
  `${SESSIONS_PATH}/${encodeURIComponent(sessionId)}`

export const deleteSessionPath = (sessionId: string, query: { agentId: AgentId }) =>
  `${sessionPath(sessionId)}?agentId=${encodeURIComponent(query.agentId)}`

export const SessionStateSchema = z.enum([
  "starting",
  "idle",
  "running",
  "awaiting-permission",
  "stopping",
  "offline",
  "error",
  "archived",
])

/** Legacy SQLite session row (prompt/resume until AGE-52). */
export const SessionSchema = z.strictObject({
  id: IdSchema,
  workspaceId: IdSchema,
  agentId: AgentIdSchema,
  name: z.string().min(1).max(120),
  state: SessionStateSchema,
  createdAt: TimestampSchema,
  lastUsedAt: TimestampSchema,
  archivedAt: TimestampSchema.nullable(),
})

/** ACP gateway session row from session/list (or session/new). */
export const AcpSessionSchema = z.strictObject({
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
  cwd: z.string(),
  title: z.string(),
  updatedAt: TimestampSchema,
})

export const CreateSessionBodySchema = z.strictObject({
  agentId: AgentIdSchema,
  cwd: z.string().min(1),
})

/**
 * The 201 create response: the catalog row plus the config options the agent
 * returned from ACP session/new, relayed verbatim.
 */
export const CreateSessionResponseSchema = AcpSessionSchema.extend({
  configOptions: SessionConfigSchema,
})

export const UpdateSessionBodySchema = z.strictObject({
  name: z.string().min(1).max(120),
})

export const SessionCollectionSchema = z.strictObject({
  items: z.array(AcpSessionSchema),
})

export const ListSessionsQuerySchema = z.strictObject({
  cwd: z.string().min(1).optional(),
})

export const DeleteSessionQuerySchema = z.strictObject({
  agentId: AgentIdSchema,
})

export const DeleteSessionParamsSchema = z.strictObject({
  sessionId: z.string().min(1),
})

export const SessionDeleteTargetSchema = z.strictObject({
  agentId: AgentIdSchema,
  sessionId: z.string().min(1),
})

export const PromptSessionBodySchema = z.strictObject({
  text: z.string().min(1).max(32_768),
  attachments: z.array(AttachmentReferenceSchema).max(MAX_ATTACHMENTS_PER_PROMPT).optional(),
})

export const PromptSessionResponseSchema = z.strictObject({
  turnId: TurnIdSchema,
})

export const CancelSessionBodySchema = z.strictObject({})

export const CancelSessionResponseSchema = z.strictObject({
  turnId: TurnIdSchema,
})

export type Session = z.infer<typeof SessionSchema>
export type SessionState = z.infer<typeof SessionStateSchema>
export type AcpSession = z.infer<typeof AcpSessionSchema>
export type CreateSessionBody = z.infer<typeof CreateSessionBodySchema>
export type CreateSessionResponse = z.infer<typeof CreateSessionResponseSchema>
export type UpdateSessionBody = z.infer<typeof UpdateSessionBodySchema>
export type SessionCollection = z.infer<typeof SessionCollectionSchema>
export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>
export type DeleteSessionQuery = z.infer<typeof DeleteSessionQuerySchema>
export type DeleteSessionParams = z.infer<typeof DeleteSessionParamsSchema>
export type SessionDeleteTarget = z.infer<typeof SessionDeleteTargetSchema>
export type PromptSessionBody = z.infer<typeof PromptSessionBodySchema>
export type PromptSessionResponse = z.infer<typeof PromptSessionResponseSchema>
export type CancelSessionBody = z.infer<typeof CancelSessionBodySchema>
export type CancelSessionResponse = z.infer<typeof CancelSessionResponseSchema>
