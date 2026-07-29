import { z } from "zod"
import { Event, EventSchema } from "contracts/events/event"
import { journalPayloadSchemaByKind } from "contracts/events/journal-record"
import { eventCursorToString } from "./cursor"
import { ParsedJournalRecord } from "./event-journal-repository"
import { LifecycleKindSchema } from "./lifecycle-kinds"

type LifecycleJournalRecordBase = {
  cursor: bigint
  schemaVersion: number
  occurredAt: string
}

type ServerStatusJournalRecord = LifecycleJournalRecordBase & {
  kind: "server.status"
  workspaceId: null
  sessionId: null
  payload: z.infer<(typeof journalPayloadSchemaByKind)["server.status"]>
}

type WorkspaceChangedJournalRecord = LifecycleJournalRecordBase & {
  kind: "workspace.changed"
  workspaceId: string
  sessionId: null
  payload: z.infer<(typeof journalPayloadSchemaByKind)["workspace.changed"]>
}

type SessionCreatedJournalRecord = LifecycleJournalRecordBase & {
  kind: "session.created"
  workspaceId: string
  sessionId: string
  payload: z.infer<(typeof journalPayloadSchemaByKind)["session.created"]>
}

type SessionStateJournalRecord = LifecycleJournalRecordBase & {
  kind: "session.state"
  workspaceId: string
  sessionId: string
  payload: z.infer<(typeof journalPayloadSchemaByKind)["session.state"]>
}

export type LifecycleJournalRecord =
  | ServerStatusJournalRecord
  | WorkspaceChangedJournalRecord
  | SessionCreatedJournalRecord
  | SessionStateJournalRecord

const requireWorkspaceId = (workspaceId: string | null, kind: string): string => {
  if (workspaceId === null) {
    throw new Error(`${kind} journal record requires workspaceId`)
  }

  return workspaceId
}

const requireSessionScope = (
  record: ParsedJournalRecord,
  kind: string,
): { workspaceId: string; sessionId: string } => {
  const workspaceId = requireWorkspaceId(record.workspaceId, kind)
  if (record.sessionId === null) {
    throw new Error(`${kind} journal record requires sessionId`)
  }

  return { workspaceId, sessionId: record.sessionId }
}

export const parseLifecycleJournalRecord = (
  record: ParsedJournalRecord,
): LifecycleJournalRecord => {
  const kind = LifecycleKindSchema.parse(record.kind)
  const base = {
    cursor: record.cursor,
    schemaVersion: record.schemaVersion,
    occurredAt: record.occurredAt,
  }

  switch (kind) {
    case "server.status": {
      if (record.workspaceId !== null || record.sessionId !== null) {
        throw new Error("server.status journal record must not include workspace or session scope")
      }

      const payload = journalPayloadSchemaByKind["server.status"].parse(record.payload)
      return {
        ...base,
        kind,
        workspaceId: null,
        sessionId: null,
        payload,
      }
    }
    case "workspace.changed": {
      if (record.sessionId !== null) {
        throw new Error("workspace.changed journal record must not include sessionId")
      }

      const workspaceId = requireWorkspaceId(record.workspaceId, kind)
      const payload = journalPayloadSchemaByKind["workspace.changed"].parse(record.payload)
      return {
        ...base,
        kind,
        workspaceId,
        sessionId: null,
        payload,
      }
    }
    case "session.created": {
      const { workspaceId, sessionId } = requireSessionScope(record, kind)
      const payload = journalPayloadSchemaByKind["session.created"].parse(record.payload)
      return {
        ...base,
        kind,
        workspaceId,
        sessionId,
        payload,
      }
    }
    case "session.state": {
      const { workspaceId, sessionId } = requireSessionScope(record, kind)
      const payload = journalPayloadSchemaByKind["session.state"].parse(record.payload)
      return {
        ...base,
        kind,
        workspaceId,
        sessionId,
        payload,
      }
    }
  }
}

const projectServerStatus = (record: ServerStatusJournalRecord): Event =>
  EventSchema.parse({
    type: "server.status",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    payload: { state: record.payload.state },
  })

const projectWorkspaceChanged = (record: WorkspaceChangedJournalRecord): Event => {
  const baseEvent = {
    type: "workspace.changed" as const,
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    workspaceId: record.workspaceId,
  }

  if (record.payload.change === "deleted") {
    return EventSchema.parse({
      ...baseEvent,
      payload: { workspaceId: record.workspaceId, change: "deleted" },
    })
  }

  return EventSchema.parse({
    ...baseEvent,
    payload: {
      workspaceId: record.workspaceId,
      change: record.payload.change,
      state: record.payload.state,
    },
  })
}

const projectSessionCreated = (record: SessionCreatedJournalRecord): Event =>
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

const projectSessionState = (record: SessionStateJournalRecord): Event =>
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

export const projectLifecycleEvent = (record: LifecycleJournalRecord): Event => {
  switch (record.kind) {
    case "server.status":
      return projectServerStatus(record)
    case "workspace.changed":
      return projectWorkspaceChanged(record)
    case "session.created":
      return projectSessionCreated(record)
    case "session.state":
      return projectSessionState(record)
  }
}

export const projectLifecycleEvents = (records: ReadonlyArray<ParsedJournalRecord>): Event[] =>
  records.map((record) => projectLifecycleEvent(parseLifecycleJournalRecord(record)))
