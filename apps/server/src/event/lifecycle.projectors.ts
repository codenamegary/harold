import { Event, EventSchema } from "contracts/events/event"
import { eventCursorToString } from "./cursor"
import { ParsedJournalRecord } from "./event-journal-repository"
import {
  LifecycleJournalRecord,
  LifecycleKind,
  parseLifecycleJournalRecord,
} from "./lifecycle.models"

type ServerStatusRecord = Extract<LifecycleJournalRecord, { kind: "server.status" }>
type WorkspaceChangedRecord = Extract<LifecycleJournalRecord, { kind: "workspace.changed" }>
type SessionCreatedRecord = Extract<LifecycleJournalRecord, { kind: "session.created" }>
type SessionStateRecord = Extract<LifecycleJournalRecord, { kind: "session.state" }>

const projectServerStatus = (record: ServerStatusRecord): Event =>
  EventSchema.parse({
    type: "server.status",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    payload: { state: record.payload.state },
  })

const projectWorkspaceChanged = (record: WorkspaceChangedRecord): Event => {
  const baseEvent = {
    type: "workspace.changed" as const,
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    workspaceId: record.workspaceId,
  }

  switch (record.payload.change) {
    case "deleted":
      return EventSchema.parse({
        ...baseEvent,
        payload: { workspaceId: record.workspaceId, change: "deleted" },
      })
    case "created":
    case "updated":
      return EventSchema.parse({
        ...baseEvent,
        payload: {
          workspaceId: record.workspaceId,
          change: record.payload.change,
          state: record.payload.state,
        },
      })
  }
}

const projectSessionCreated = (record: SessionCreatedRecord): Event =>
  EventSchema.parse({
    type: "session.created",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    payload: {
      sessionId: record.sessionId,
      workspaceId: record.workspaceId,
      name: record.payload.name,
    },
  })

const projectSessionState = (record: SessionStateRecord): Event =>
  EventSchema.parse({
    type: "session.state",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    payload: {
      sessionId: record.sessionId,
      state: record.payload.state,
    },
  })

const lifecycleProjectors = {
  "server.status": projectServerStatus,
  "workspace.changed": projectWorkspaceChanged,
  "session.created": projectSessionCreated,
  "session.state": projectSessionState,
} satisfies {
  [K in LifecycleKind]: (record: Extract<LifecycleJournalRecord, { kind: K }>) => Event
}

export const projectLifecycleEvent = (record: LifecycleJournalRecord): Event => {
  switch (record.kind) {
    case "server.status":
      return lifecycleProjectors["server.status"](record)
    case "workspace.changed":
      return lifecycleProjectors["workspace.changed"](record)
    case "session.created":
      return lifecycleProjectors["session.created"](record)
    case "session.state":
      return lifecycleProjectors["session.state"](record)
  }
}

export const projectLifecycleEvents = (records: ReadonlyArray<ParsedJournalRecord>): Event[] =>
  records.map((record) => projectLifecycleEvent(parseLifecycleJournalRecord(record)))
