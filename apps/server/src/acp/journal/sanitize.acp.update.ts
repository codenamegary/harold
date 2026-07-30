import { FailureCode } from "contracts/events/primitives"
import { ToolKind } from "contracts/events/primitives"
import { JournalAppendRecord } from "contracts/events/journal-record"
import { JOURNAL_SCHEMA_VERSION } from "contracts/events/journal-record"
import { sanitizeAcpErrorMessage } from "../sanitize-acp-error"

export type SanitizedNotificationPayload = Extract<
  JournalAppendRecord,
  { kind: "acp.notification" }
>["payload"]

export type SanitizedPermissionPayload = Extract<
  JournalAppendRecord,
  { kind: "acp.permission" }
>["payload"]

const excludedJournalMethods = new Set(["initialize", "authenticate"])

export const shouldJournalAcpMethod = (method: string): boolean =>
  !excludedJournalMethods.has(method)

const toolKindValues: ReadonlyArray<ToolKind> = ["read", "edit", "execute"]

const parseToolKind = (value: unknown): ToolKind =>
  toolKindValues.find((kind) => kind === value) ?? "execute"

const readUpdateEnvelope = (
  update: unknown,
): { updateKind: string; fields: Record<string, unknown> } | undefined => {
  if (typeof update !== "object" || update === null) {
    return undefined
  }

  const value = update as Record<string, unknown>
  const updateKind =
    typeof value.sessionUpdate === "string"
      ? value.sessionUpdate
      : typeof value.updateKind === "string"
        ? value.updateKind
        : typeof value.kind === "string"
          ? value.kind
          : undefined

  if (updateKind === undefined) {
    return undefined
  }

  return { updateKind, fields: value }
}

const readChunkText = (fields: Record<string, unknown>): string | undefined => {
  if (typeof fields.text === "string") {
    return fields.text
  }

  if (typeof fields.content === "string") {
    return fields.content
  }

  if (
    typeof fields.content === "object"
    && fields.content !== null
    && typeof (fields.content as { text?: unknown }).text === "string"
  ) {
    return (fields.content as { text: string }).text
  }

  return undefined
}

export const sanitizeSessionUpdate = (update: unknown): SanitizedNotificationPayload | undefined => {
  const envelope = readUpdateEnvelope(update)
  if (envelope === undefined) {
    return undefined
  }

  const { updateKind, fields } = envelope

  switch (updateKind) {
    case "agent_message_chunk": {
      const text = readChunkText(fields)
      if (text === undefined) {
        return undefined
      }
      return { updateKind: "agent_message_chunk", text }
    }
    case "tool_call": {
      const toolCallId = typeof fields.toolCallId === "string" ? fields.toolCallId : undefined
      const toolName =
        typeof fields.toolName === "string"
          ? fields.toolName
          : typeof fields.name === "string"
            ? fields.name
            : typeof fields.title === "string"
              ? fields.title
              : undefined
      if (toolCallId === undefined || toolName === undefined) {
        return undefined
      }
      return {
        updateKind: "tool_call",
        toolCallId,
        toolName,
        toolKind: parseToolKind(fields.toolKind ?? fields.kind),
        ...(fields.status === "pending" ? { status: "pending" as const } : {}),
      }
    }
    case "tool_call_update": {
      const toolCallId = typeof fields.toolCallId === "string" ? fields.toolCallId : undefined
      const toolName =
        typeof fields.toolName === "string"
          ? fields.toolName
          : typeof fields.title === "string"
            ? fields.title
            : undefined
      const status = fields.status
      if (
        toolCallId === undefined
        || toolName === undefined
        || (status !== "in_progress" && status !== "completed" && status !== "failed")
      ) {
        return undefined
      }
      return {
        updateKind: "tool_call_update",
        toolCallId,
        toolName,
        toolKind: parseToolKind(fields.toolKind ?? fields.kind),
        status,
      }
    }
    case "session_info_update": {
      const title = typeof fields.title === "string" ? fields.title : undefined
      return title === undefined
        ? { updateKind: "session_info_update" }
        : { updateKind: "session_info_update", title }
    }
    case "user_message_chunk":
      return { updateKind: "user_message_chunk" }
    default:
      return { updateKind: "unknown", sourceKind: updateKind }
  }
}

export const sanitizePermissionRequest = (
  params: unknown,
): SanitizedPermissionPayload | undefined => {
  if (typeof params !== "object" || params === null) {
    return undefined
  }

  const value = params as {
    toolCall?: { toolCallId?: string; name?: string }
  }

  const toolCallId = value.toolCall?.toolCallId
  const toolName = value.toolCall?.name

  if (toolCallId === undefined || toolName === undefined) {
    return undefined
  }

  return { toolCallId, toolName }
}

const failureCodeByPhrase: ReadonlyArray<{ pattern: RegExp; code: FailureCode }> = [
  { pattern: /connection refused/i, code: "transport_connection_refused" },
  { pattern: /connection reset/i, code: "transport_connection_reset" },
  { pattern: /timed out/i, code: "transport_timeout" },
  { pattern: /pipe closed/i, code: "transport_pipe_closed" },
  { pattern: /invalid json/i, code: "transport_invalid_json" },
]

export const mapSanitizedErrorToFailureCode = (message: string): FailureCode => {
  const sanitized = sanitizeAcpErrorMessage(message)
  const match = failureCodeByPhrase.find(({ pattern }) => pattern.test(sanitized))
  if (match) {
    return match.code
  }

  if (sanitized.includes("prompt")) {
    return "prompt_failed"
  }

  if (sanitized.includes("protocol")) {
    return "protocol_error"
  }

  return "agent_error"
}

export const createAcpRequestRecord = (params: {
  occurredAt: string
  workspaceId: string
  sessionId: string
  turnId?: string
  protocolVersion: number
  phase: "live" | "load_replay"
  method: string
  jsonRpcId: number
}): JournalAppendRecord => ({
  schemaVersion: JOURNAL_SCHEMA_VERSION,
  kind: "acp.request",
  occurredAt: params.occurredAt,
  workspaceId: params.workspaceId,
  sessionId: params.sessionId,
  turnId: params.turnId,
  protocolVersion: params.protocolVersion,
  direction: "agent_server_to_agent",
  method: params.method,
  phase: params.phase,
  payload: { jsonRpcId: params.jsonRpcId },
})

export const createAcpResponseRecord = (params: {
  occurredAt: string
  workspaceId: string
  sessionId: string
  turnId?: string
  protocolVersion: number
  phase: "live" | "load_replay"
  method: string
  jsonRpcId: number
  success: boolean
}): JournalAppendRecord => ({
  schemaVersion: JOURNAL_SCHEMA_VERSION,
  kind: "acp.response",
  occurredAt: params.occurredAt,
  workspaceId: params.workspaceId,
  sessionId: params.sessionId,
  turnId: params.turnId,
  protocolVersion: params.protocolVersion,
  direction: "agent_to_agent_server",
  method: params.method,
  phase: params.phase,
  payload: { jsonRpcId: params.jsonRpcId, success: params.success },
})

export const createAcpNotificationRecord = (params: {
  occurredAt: string
  workspaceId: string
  sessionId: string
  turnId?: string
  protocolVersion: number
  phase: "live" | "load_replay"
  payload: SanitizedNotificationPayload
}): JournalAppendRecord => ({
  schemaVersion: JOURNAL_SCHEMA_VERSION,
  kind: "acp.notification",
  occurredAt: params.occurredAt,
  workspaceId: params.workspaceId,
  sessionId: params.sessionId,
  turnId: params.turnId,
  protocolVersion: params.protocolVersion,
  direction: "agent_to_agent_server",
  phase: params.phase,
  payload: params.payload,
})

export const createAcpPermissionRecord = (params: {
  occurredAt: string
  workspaceId: string
  sessionId: string
  turnId: string
  protocolVersion: number
  phase: "live" | "load_replay"
  payload: SanitizedPermissionPayload
}): JournalAppendRecord => ({
  schemaVersion: JOURNAL_SCHEMA_VERSION,
  kind: "acp.permission",
  occurredAt: params.occurredAt,
  workspaceId: params.workspaceId,
  sessionId: params.sessionId,
  turnId: params.turnId,
  protocolVersion: params.protocolVersion,
  direction: "agent_to_agent_server",
  method: "session/request_permission",
  phase: params.phase,
  payload: params.payload,
})
