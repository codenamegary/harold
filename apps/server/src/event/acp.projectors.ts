import { Event, EventSchema } from "contracts/events/event"
import { eventCursorToString } from "./cursor"
import { AcpJournalRecord } from "./acp.models"

type AgentOutputChunk = {
  cursor: bigint
  text: string
}

type AcpProjectionContext = {
  outputChunksByTurnId: Readonly<Record<string, ReadonlyArray<AgentOutputChunk>>>
}

type AcpNotificationRecord = Extract<AcpJournalRecord, { kind: "acp.notification" }>
type PermissionRecord = Extract<AcpJournalRecord, { kind: "acp.permission" }>
type TurnStartedRecord = Extract<AcpJournalRecord, { kind: "turn.started" }>
type TurnCompletedRecord = Extract<AcpJournalRecord, { kind: "turn.completed" }>
type TurnFailedRecord = Extract<AcpJournalRecord, { kind: "turn.failed" }>
type TurnCancelledRecord = Extract<AcpJournalRecord, { kind: "turn.cancelled" }>

const isLivePhase = (record: AcpJournalRecord): boolean =>
  "phase" in record ? record.phase === "live" : true

const foldOutputText = (chunks: ReadonlyArray<AgentOutputChunk>): string =>
  chunks
    .toSorted((left, right) => Number(left.cursor - right.cursor))
    .map((chunk) => chunk.text)
    .join("")

const projectNotification = (record: AcpNotificationRecord): Event[] => {
  if (!isLivePhase(record) || record.turnId === null) {
    return []
  }

  const turnId = record.turnId
  const baseEvent = {
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
  }

  switch (record.payload.updateKind) {
    case "agent_message_chunk":
      return [
        EventSchema.parse({
          ...baseEvent,
          type: "session.output.delta",
          payload: { turnId, text: record.payload.text },
        }),
      ]
    case "agent_thought_chunk":
      return [
        EventSchema.parse({
          ...baseEvent,
          type: "session.thought.delta",
          payload: { turnId, text: record.payload.text },
        }),
      ]
    case "tool_call":
      return [
        EventSchema.parse({
          ...baseEvent,
          type: "session.tool.started",
          payload: {
            turnId,
            toolCallId: record.payload.toolCallId,
            toolName: record.payload.toolName,
            toolKind: record.payload.toolKind,
          },
        }),
      ]
    case "tool_call_update":
      return [
        EventSchema.parse({
          ...baseEvent,
          type: "session.tool.completed",
          payload: {
            turnId,
            toolCallId: record.payload.toolCallId,
            toolName: record.payload.toolName,
            toolKind: record.payload.toolKind,
            status: record.payload.status,
          },
        }),
      ]
    case "user_message_chunk":
    case "session_info_update":
    case "unknown":
      return []
  }
}

const projectPermissionRequested = (record: PermissionRecord): Event =>
  EventSchema.parse({
    type: "session.permission.requested",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    payload: {
      turnId: record.turnId,
      toolCallId: record.payload.toolCallId,
      toolName: record.payload.toolName,
    },
  })

const projectTurnStarted = (record: TurnStartedRecord): Event =>
  EventSchema.parse({
    type: "turn.started",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    payload: {
      turnId: record.turnId,
      text: record.payload.text ?? "",
    },
  })

const projectTurnCompleted = (
  record: TurnCompletedRecord,
  context: AcpProjectionContext,
): Event[] => {
  const chunks = context.outputChunksByTurnId[record.turnId] ?? []
  const completeText = foldOutputText(chunks)

  return [
    EventSchema.parse({
      type: "session.output.complete",
      cursor: eventCursorToString(record.cursor),
      occurredAt: record.occurredAt,
      workspaceId: record.workspaceId,
      sessionId: record.sessionId,
      payload: {
        turnId: record.turnId,
        text: completeText,
      },
    }),
    EventSchema.parse({
      type: "turn.completed",
      cursor: eventCursorToString(record.cursor),
      occurredAt: record.occurredAt,
      workspaceId: record.workspaceId,
      sessionId: record.sessionId,
      payload: {
        turnId: record.turnId,
        sessionId: record.sessionId,
      },
    }),
  ]
}

const projectTurnFailed = (record: TurnFailedRecord): Event =>
  EventSchema.parse({
    type: "turn.failed",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    payload: {
      turnId: record.turnId,
      sessionId: record.sessionId,
      failureCode: record.payload.failureCode,
    },
  })

const projectTurnCancelled = (record: TurnCancelledRecord): Event =>
  EventSchema.parse({
    type: "turn.cancelled",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    payload: {
      turnId: record.turnId,
      sessionId: record.sessionId,
    },
  })

export const projectAcpEvent = (
  record: AcpJournalRecord,
  context: AcpProjectionContext,
): Event[] => {
  switch (record.kind) {
    case "turn.started":
      return [projectTurnStarted(record)]
    case "acp.request":
    case "acp.response":
      return []
    case "acp.notification":
      return projectNotification(record)
    case "acp.permission":
      return isLivePhase(record) ? [projectPermissionRequested(record)] : []
    case "turn.completed":
      return projectTurnCompleted(record, context)
    case "turn.failed":
      return [projectTurnFailed(record)]
    case "turn.cancelled":
      return [projectTurnCancelled(record)]
  }
}

export const buildOutputChunksByTurnId = (
  records: ReadonlyArray<AcpJournalRecord>,
): Record<string, AgentOutputChunk[]> =>
  records.reduce<Record<string, AgentOutputChunk[]>>((accumulator, record) => {
    if (
      record.kind !== "acp.notification" ||
      record.payload.updateKind !== "agent_message_chunk" ||
      record.turnId === null
    ) {
      return accumulator
    }

    const turnId = record.turnId
    const existing = accumulator[turnId] ?? []
    return {
      ...accumulator,
      [turnId]: [...existing, { cursor: record.cursor, text: record.payload.text }],
    }
  }, {})

export const projectAcpEvents = (
  records: ReadonlyArray<AcpJournalRecord>,
  contextRecords: ReadonlyArray<AcpJournalRecord> = [],
): Event[] => {
  const allRecords = [...contextRecords, ...records]
  const context: AcpProjectionContext = {
    outputChunksByTurnId: buildOutputChunksByTurnId(allRecords),
  }

  return records.flatMap((record) => projectAcpEvent(record, context))
}
