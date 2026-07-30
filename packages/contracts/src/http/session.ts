import { z } from "zod"
import { TurnIdSchema } from "../events/primitives"
import { AgentIdSchema } from "./agent-settings"
import { createCollectionSchema } from "./collection"
import { CursorSchema, IdSchema, TimestampSchema } from "./primitives"

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

export const CreateSessionBodySchema = z.strictObject({
  workspaceId: IdSchema,
  agentId: AgentIdSchema,
  name: z.string().min(1).max(120),
})

export const UpdateSessionBodySchema = z.strictObject({
  name: z.string().min(1).max(120),
})

export const SessionCollectionSchema = createCollectionSchema(SessionSchema)

export const ListSessionsQuerySchema = z.strictObject({
  workspaceId: IdSchema,
  limit: z.coerce.number().int().positive().max(200).default(100),
  cursor: CursorSchema.optional(),
})

export const PromptSessionBodySchema = z.strictObject({
  text: z.string().min(1).max(32_768),
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
export type CreateSessionBody = z.infer<typeof CreateSessionBodySchema>
export type UpdateSessionBody = z.infer<typeof UpdateSessionBodySchema>
export type SessionCollection = z.infer<typeof SessionCollectionSchema>
export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>
export type PromptSessionBody = z.infer<typeof PromptSessionBodySchema>
export type PromptSessionResponse = z.infer<typeof PromptSessionResponseSchema>
export type CancelSessionBody = z.infer<typeof CancelSessionBodySchema>
export type CancelSessionResponse = z.infer<typeof CancelSessionResponseSchema>
