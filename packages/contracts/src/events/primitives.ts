import { z } from "zod"

export const EventCursorSchema = z.string().regex(/^(0|[1-9][0-9]*)$/)

export const TurnIdSchema = z.string().regex(/^turn_[0-9A-HJKMNP-TV-Z]{26}$/)

export const ToolCallIdSchema = z.string().min(1)

export const ToolKindSchema = z.enum(["read", "edit", "execute"])

export const WorkspaceChangeKindSchema = z.enum(["created", "updated", "deleted"])

export const FailureCodeSchema = z.enum([
  "transport_connection_refused",
  "transport_connection_reset",
  "transport_timeout",
  "transport_pipe_closed",
  "transport_invalid_json",
  "transport_error",
  "prompt_failed",
  "agent_error",
  "protocol_error",
])

export const ToolCallStatusSchema = z.enum(["pending", "in_progress", "completed", "failed"])

export type EventCursor = z.infer<typeof EventCursorSchema>
export type TurnId = z.infer<typeof TurnIdSchema>
export type ToolCallId = z.infer<typeof ToolCallIdSchema>
export type ToolKind = z.infer<typeof ToolKindSchema>
export type WorkspaceChangeKind = z.infer<typeof WorkspaceChangeKindSchema>
export type FailureCode = z.infer<typeof FailureCodeSchema>
export type ToolCallStatus = z.infer<typeof ToolCallStatusSchema>
