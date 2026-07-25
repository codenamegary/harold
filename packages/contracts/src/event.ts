import { z } from "zod";
import { CursorSchema, IdSchema, TimestampSchema } from "./primitives";
import { RelayStateSchema } from "./status";
import { SessionStateSchema } from "./session";
import { WorkspaceStateSchema } from "./workspace";

const EventScopeSchema = z.object({
  cursor: CursorSchema,
  occurredAt: TimestampSchema,
  workspaceId: IdSchema.optional(),
  sessionId: IdSchema.optional(),
});

export const EventSchema = z.discriminatedUnion("type", [
  EventScopeSchema.extend({
    type: z.literal("server.status"),
    payload: z.object({
      state: RelayStateSchema,
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("workspace.changed"),
    payload: z.object({
      workspaceId: IdSchema,
      state: WorkspaceStateSchema,
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.created"),
    payload: z.object({
      sessionId: IdSchema,
      workspaceId: IdSchema,
      name: z.string().min(1),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.state"),
    payload: z.object({
      sessionId: IdSchema,
      state: SessionStateSchema,
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.output.delta"),
    payload: z.object({
      text: z.string(),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.output.complete"),
    payload: z.object({
      text: z.string(),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.tool.started"),
    payload: z.object({
      toolName: z.string().min(1),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.tool.completed"),
    payload: z.object({
      toolName: z.string().min(1),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("session.permission.requested"),
    payload: z.object({
      title: z.string().min(1),
      detail: z.string().min(1),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("turn.completed"),
    payload: z.object({
      sessionId: IdSchema,
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("turn.failed"),
    payload: z.object({
      sessionId: IdSchema,
      message: z.string().min(1),
    }),
  }),
  EventScopeSchema.extend({
    type: z.literal("turn.cancelled"),
    payload: z.object({
      sessionId: IdSchema,
    }),
  }),
]);

export type Event = z.infer<typeof EventSchema>;
