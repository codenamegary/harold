import { Event, EventSchema } from "contracts/events/event"
import { AgentServerState } from "contracts/http/status"
import { SessionState } from "contracts/http/session"
import { WorkspaceState } from "contracts/http/workspace"
import { eventCursorToString } from "./cursor"
import { ParsedJournalRecord } from "./event-journal-repository"

const lifecycleKinds = new Set([
  "server.status",
  "workspace.changed",
  "session.created",
  "session.state",
])

export const isLifecycleJournalRecord = (record: ParsedJournalRecord): boolean =>
  lifecycleKinds.has(record.kind)

type WorkspaceChangedPayload =
  | { change: "deleted" }
  | { change: "created" | "updated"; state: WorkspaceState }

const projectServerStatus = (record: ParsedJournalRecord): Event => {
  const payload = record.payload as { state: AgentServerState }
  return EventSchema.parse({
    type: "server.status",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    payload: { state: payload.state },
  })
}

const projectWorkspaceChanged = (record: ParsedJournalRecord): Event => {
  const payload = record.payload as WorkspaceChangedPayload
  const workspaceId = record.workspaceId!

  if (payload.change === "deleted") {
    return EventSchema.parse({
      type: "workspace.changed",
      cursor: eventCursorToString(record.cursor),
      occurredAt: record.occurredAt,
      workspaceId,
      payload: { workspaceId, change: "deleted" },
    })
  }

  return EventSchema.parse({
    type: "workspace.changed",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    workspaceId,
    payload: {
      workspaceId,
      change: payload.change,
      state: payload.state,
    },
  })
}

const projectSessionCreated = (record: ParsedJournalRecord): Event => {
  const payload = record.payload as { name: string }
  return EventSchema.parse({
    type: "session.created",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    workspaceId: record.workspaceId!,
    sessionId: record.sessionId!,
    payload: {
      sessionId: record.sessionId!,
      workspaceId: record.workspaceId!,
      name: payload.name,
    },
  })
}

const projectSessionState = (record: ParsedJournalRecord): Event => {
  const payload = record.payload as { state: SessionState }
  return EventSchema.parse({
    type: "session.state",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    workspaceId: record.workspaceId!,
    sessionId: record.sessionId!,
    payload: {
      sessionId: record.sessionId!,
      state: payload.state,
    },
  })
}

const lifecycleProjectors: Record<
  "server.status" | "workspace.changed" | "session.created" | "session.state",
  (record: ParsedJournalRecord) => Event
> = {
  "server.status": projectServerStatus,
  "workspace.changed": projectWorkspaceChanged,
  "session.created": projectSessionCreated,
  "session.state": projectSessionState,
}

export const projectLifecycleEvent = (record: ParsedJournalRecord): Event | undefined => {
  if (!isLifecycleJournalRecord(record)) {
    return undefined
  }

  const projector = lifecycleProjectors[record.kind as keyof typeof lifecycleProjectors]
  return projector(record)
}

export const projectLifecycleEvents = (records: ParsedJournalRecord[]): Event[] =>
  records.flatMap((record) => {
    const projected = projectLifecycleEvent(record)
    return projected === undefined ? [] : [projected]
  })
