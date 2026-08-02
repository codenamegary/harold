import { z } from "zod"
import { IdSchema, TimestampSchema } from "../http/primitives"
import { AgentServerStateSchema } from "../http/status"
import { SessionStateSchema } from "../http/session"
import { WorkspaceStateSchema } from "../http/workspace"
import {
  FailureCodeSchema,
  ToolCallIdSchema,
  ToolCallStatusSchema,
  ToolKindSchema,
  TurnIdSchema,
  WorkspaceChangeKindSchema,
} from "./primitives"

export const JOURNAL_SCHEMA_VERSION = 1

export const JournalRecordKindSchema = z.enum([
  "server.status",
  "workspace.changed",
  "session.created",
  "session.state",
  "turn.started",
  "turn.completed",
  "turn.failed",
  "turn.cancelled",
  "acp.request",
  "acp.response",
  "acp.notification",
  "acp.permission",
  "device.paired",
  "device.connected",
  "device.disconnected",
  "device.revoked",
])

export const JournalDirectionSchema = z.enum(["agent_server_to_agent", "agent_to_agent_server"])

export const JournalPhaseSchema = z.enum(["live", "load_replay"])

const JournalSchemaVersionSchema = z.literal(JOURNAL_SCHEMA_VERSION)

const ServerStatusPayloadSchema = z.strictObject({
  state: AgentServerStateSchema,
})

const WorkspaceChangedPayloadSchema = z.discriminatedUnion("change", [
  z.strictObject({
    change: z.literal("deleted"),
  }),
  z.strictObject({
    change: WorkspaceChangeKindSchema.exclude(["deleted"]),
    state: WorkspaceStateSchema,
  }),
])

const SessionCreatedPayloadSchema = z.strictObject({
  name: z.string().min(1),
})

const DevicePairedPayloadSchema = z.strictObject({
  deviceId: IdSchema,
  name: z.string().min(1),
  platform: z.string().min(1).nullable(),
})

const DeviceIdPayloadSchema = z.strictObject({
  deviceId: IdSchema,
})

const SessionStatePayloadSchema = z.strictObject({
  state: SessionStateSchema,
})

const TurnStartedPayloadSchema = z.strictObject({
  text: z.string().default(""),
})

const TurnCompletedPayloadSchema = z.strictObject({})

const TurnFailedPayloadSchema = z.strictObject({
  failureCode: FailureCodeSchema,
})

const TurnCancelledPayloadSchema = z.strictObject({})

const AcpRequestPayloadSchema = z.strictObject({
  jsonRpcId: z.number().int().positive(),
})

const AcpResponsePayloadSchema = z.strictObject({
  jsonRpcId: z.number().int().positive(),
  success: z.boolean(),
})

const AcpPermissionPayloadSchema = z.strictObject({
  toolCallId: ToolCallIdSchema,
  toolName: z.string().min(1),
})

const AgentMessageChunkNotificationPayloadSchema = z.strictObject({
  updateKind: z.literal("agent_message_chunk"),
  text: z.string(),
})

const AgentThoughtChunkNotificationPayloadSchema = z.strictObject({
  updateKind: z.literal("agent_thought_chunk"),
  text: z.string(),
})

const ToolCallNotificationPayloadSchema = z.strictObject({
  updateKind: z.literal("tool_call"),
  toolCallId: ToolCallIdSchema,
  toolName: z.string().min(1),
  toolKind: ToolKindSchema,
  status: z.literal("pending").optional(),
})

const ToolCallUpdateNotificationPayloadSchema = z.strictObject({
  updateKind: z.literal("tool_call_update"),
  toolCallId: ToolCallIdSchema,
  toolName: z.string().min(1),
  toolKind: ToolKindSchema,
  status: ToolCallStatusSchema.exclude(["pending"]),
})

const SessionInfoUpdateNotificationPayloadSchema = z.strictObject({
  updateKind: z.literal("session_info_update"),
  title: z.string().min(1).optional(),
})

const UserMessageChunkNotificationPayloadSchema = z.strictObject({
  updateKind: z.literal("user_message_chunk"),
})

const UnknownUpdateNotificationPayloadSchema = z.strictObject({
  updateKind: z.literal("unknown"),
  sourceKind: z.string().min(1),
})

const AcpNotificationPayloadSchema = z.discriminatedUnion("updateKind", [
  AgentMessageChunkNotificationPayloadSchema,
  AgentThoughtChunkNotificationPayloadSchema,
  ToolCallNotificationPayloadSchema,
  ToolCallUpdateNotificationPayloadSchema,
  SessionInfoUpdateNotificationPayloadSchema,
  UserMessageChunkNotificationPayloadSchema,
  UnknownUpdateNotificationPayloadSchema,
])

const JournalAppendBaseSchema = z.strictObject({
  schemaVersion: JournalSchemaVersionSchema,
  occurredAt: TimestampSchema,
})

export const JournalAppendRecordSchema = z.discriminatedUnion("kind", [
  JournalAppendBaseSchema.extend({
    kind: z.literal("server.status"),
    payload: ServerStatusPayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("workspace.changed"),
    workspaceId: IdSchema,
    payload: WorkspaceChangedPayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("session.created"),
    workspaceId: IdSchema,
    sessionId: IdSchema,
    payload: SessionCreatedPayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("session.state"),
    workspaceId: IdSchema,
    sessionId: IdSchema,
    payload: SessionStatePayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("turn.started"),
    workspaceId: IdSchema,
    sessionId: IdSchema,
    turnId: TurnIdSchema,
    payload: TurnStartedPayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("turn.completed"),
    workspaceId: IdSchema,
    sessionId: IdSchema,
    turnId: TurnIdSchema,
    payload: TurnCompletedPayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("turn.failed"),
    workspaceId: IdSchema,
    sessionId: IdSchema,
    turnId: TurnIdSchema,
    payload: TurnFailedPayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("turn.cancelled"),
    workspaceId: IdSchema,
    sessionId: IdSchema,
    turnId: TurnIdSchema,
    payload: TurnCancelledPayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("acp.request"),
    workspaceId: IdSchema,
    sessionId: IdSchema,
    turnId: TurnIdSchema.optional(),
    protocolVersion: z.number().int().positive(),
    direction: z.literal("agent_server_to_agent"),
    method: z.string().min(1),
    phase: JournalPhaseSchema,
    payload: AcpRequestPayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("acp.response"),
    workspaceId: IdSchema,
    sessionId: IdSchema,
    turnId: TurnIdSchema.optional(),
    protocolVersion: z.number().int().positive(),
    direction: z.literal("agent_to_agent_server"),
    method: z.string().min(1),
    phase: JournalPhaseSchema,
    payload: AcpResponsePayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("acp.notification"),
    workspaceId: IdSchema,
    sessionId: IdSchema,
    turnId: TurnIdSchema.optional(),
    protocolVersion: z.number().int().positive(),
    direction: z.literal("agent_to_agent_server"),
    phase: JournalPhaseSchema,
    payload: AcpNotificationPayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("acp.permission"),
    workspaceId: IdSchema,
    sessionId: IdSchema,
    turnId: TurnIdSchema,
    protocolVersion: z.number().int().positive(),
    direction: z.literal("agent_to_agent_server"),
    method: z.literal("session/request_permission"),
    phase: JournalPhaseSchema,
    payload: AcpPermissionPayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("device.paired"),
    payload: DevicePairedPayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("device.connected"),
    payload: DeviceIdPayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("device.disconnected"),
    payload: DeviceIdPayloadSchema,
  }),
  JournalAppendBaseSchema.extend({
    kind: z.literal("device.revoked"),
    payload: DeviceIdPayloadSchema,
  }),
])

export const JournalStoredPayloadSchema = z.union([
  ServerStatusPayloadSchema,
  WorkspaceChangedPayloadSchema,
  SessionCreatedPayloadSchema,
  SessionStatePayloadSchema,
  TurnStartedPayloadSchema,
  TurnCompletedPayloadSchema,
  TurnFailedPayloadSchema,
  TurnCancelledPayloadSchema,
  AcpRequestPayloadSchema,
  AcpResponsePayloadSchema,
  AcpNotificationPayloadSchema,
  AcpPermissionPayloadSchema,
  DevicePairedPayloadSchema,
  DeviceIdPayloadSchema,
])

export const journalPayloadSchemaByKind = {
  "server.status": ServerStatusPayloadSchema,
  "workspace.changed": WorkspaceChangedPayloadSchema,
  "session.created": SessionCreatedPayloadSchema,
  "session.state": SessionStatePayloadSchema,
  "turn.started": TurnStartedPayloadSchema,
  "turn.completed": TurnCompletedPayloadSchema,
  "turn.failed": TurnFailedPayloadSchema,
  "turn.cancelled": TurnCancelledPayloadSchema,
  "acp.request": AcpRequestPayloadSchema,
  "acp.response": AcpResponsePayloadSchema,
  "acp.notification": AcpNotificationPayloadSchema,
  "acp.permission": AcpPermissionPayloadSchema,
  "device.paired": DevicePairedPayloadSchema,
  "device.connected": DeviceIdPayloadSchema,
  "device.disconnected": DeviceIdPayloadSchema,
  "device.revoked": DeviceIdPayloadSchema,
} as const satisfies Record<z.infer<typeof JournalRecordKindSchema>, z.ZodType>

export type JournalRecordKind = z.infer<typeof JournalRecordKindSchema>
export type JournalDirection = z.infer<typeof JournalDirectionSchema>
export type JournalPhase = z.infer<typeof JournalPhaseSchema>
export type JournalAppendRecord = z.infer<typeof JournalAppendRecordSchema>
