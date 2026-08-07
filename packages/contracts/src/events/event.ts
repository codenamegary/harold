import { z } from "zod"
import { IdSchema, TimestampSchema } from "../http/primitives"
import { AgentServerStateSchema } from "../http/status"
import { SessionStateSchema } from "../http/session"
import { WorkspaceStateSchema } from "../http/workspace"
import {
  EventCursorSchema,
  FailureCodeSchema,
  ToolCallIdSchema,
  ToolCallStatusSchema,
  ToolKindSchema,
  TurnIdSchema,
  WorkspaceChangeKindSchema,
} from "./primitives"
import { PermissionOptionSchema } from "../http/permission"

const EventScopeSchema = z.object({
  cursor: EventCursorSchema,
  occurredAt: TimestampSchema,
  workspaceId: IdSchema.optional(),
  sessionId: IdSchema.optional(),
})

const WorkspaceChangedPayloadSchema = z.discriminatedUnion("change", [
  z.strictObject({
    workspaceId: IdSchema,
    change: z.literal("deleted"),
  }),
  z.strictObject({
    workspaceId: IdSchema,
    change: WorkspaceChangeKindSchema.exclude(["deleted"]),
    state: WorkspaceStateSchema,
  }),
])

export const EventSchema = z.discriminatedUnion("type", [
  EventScopeSchema.extend({
    type: z.literal("server.status"),
    payload: z.strictObject({
      state: AgentServerStateSchema,
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("workspace.changed"),
    payload: WorkspaceChangedPayloadSchema,
  }),
  EventScopeSchema.extend({
    type: z.literal("session.created"),
    payload: z.strictObject({
      sessionId: IdSchema,
      workspaceId: IdSchema,
      name: z.string().min(1),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.state"),
    payload: z.strictObject({
      sessionId: IdSchema,
      state: SessionStateSchema,
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.output.delta"),
    payload: z.strictObject({
      turnId: TurnIdSchema,
      text: z.string(),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.output.complete"),
    payload: z.strictObject({
      turnId: TurnIdSchema,
      text: z.string(),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.thought.delta"),
    payload: z.strictObject({
      turnId: TurnIdSchema,
      text: z.string(),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.tool.started"),
    payload: z.strictObject({
      turnId: TurnIdSchema,
      toolCallId: ToolCallIdSchema,
      toolName: z.string().min(1),
      toolKind: ToolKindSchema,
      detail: z.string().min(1).optional(),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.tool.completed"),
    payload: z.strictObject({
      turnId: TurnIdSchema,
      toolCallId: ToolCallIdSchema,
      toolName: z.string().min(1).optional(),
      toolKind: ToolKindSchema.optional(),
      status: ToolCallStatusSchema,
      detail: z.string().min(1).optional(),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.permission.requested"),
    payload: z.strictObject({
      requestId: IdSchema,
      turnId: TurnIdSchema,
      toolCallId: ToolCallIdSchema,
      toolName: z.string().min(1),
      options: z.array(PermissionOptionSchema).min(1),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.permission.resolved"),
    payload: z.strictObject({
      requestId: IdSchema,
      turnId: TurnIdSchema,
      toolCallId: ToolCallIdSchema,
      optionId: z.string().min(1),
      outcome: z.enum(["selected", "cancelled"]),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("turn.started"),
    payload: z.strictObject({
      turnId: TurnIdSchema,
      text: z.string(),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("turn.completed"),
    payload: z.strictObject({
      turnId: TurnIdSchema,
      sessionId: IdSchema,
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("turn.failed"),
    payload: z.strictObject({
      turnId: TurnIdSchema,
      sessionId: IdSchema,
      failureCode: FailureCodeSchema,
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("turn.cancelled"),
    payload: z.strictObject({
      turnId: TurnIdSchema,
      sessionId: IdSchema,
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("device.paired"),
    payload: z.strictObject({
      deviceId: IdSchema,
      name: z.string().min(1),
      platform: z.string().min(1).nullable(),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("device.connected"),
    payload: z.strictObject({
      deviceId: IdSchema,
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("device.disconnected"),
    payload: z.strictObject({
      deviceId: IdSchema,
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("device.revoked"),
    payload: z.strictObject({
      deviceId: IdSchema,
    }),
  }),
])

export type Event = z.infer<typeof EventSchema>
