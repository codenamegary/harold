import { Event, EventSchema } from "contracts/events/event"
import { eventCursorToString } from "./cursor"
import { LifecycleJournalRecord } from "./lifecycle.models"

type ServerStatusRecord = Extract<LifecycleJournalRecord, { kind: "server.status" }>
type WorkspaceChangedRecord = Extract<LifecycleJournalRecord, { kind: "workspace.changed" }>
type SessionCreatedRecord = Extract<LifecycleJournalRecord, { kind: "session.created" }>
type SessionStateRecord = Extract<LifecycleJournalRecord, { kind: "session.state" }>
type SessionPermissionResolvedRecord = Extract<
  LifecycleJournalRecord,
  { kind: "session.permission.resolved" }
>
type DevicePairedRecord = Extract<LifecycleJournalRecord, { kind: "device.paired" }>
type DeviceConnectedRecord = Extract<LifecycleJournalRecord, { kind: "device.connected" }>
type DeviceDisconnectedRecord = Extract<LifecycleJournalRecord, { kind: "device.disconnected" }>
type DeviceRevokedRecord = Extract<LifecycleJournalRecord, { kind: "device.revoked" }>

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

const projectSessionPermissionResolved = (record: SessionPermissionResolvedRecord): Event =>
  EventSchema.parse({
    type: "session.permission.resolved",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    workspaceId: record.workspaceId,
    sessionId: record.sessionId,
    payload: {
      requestId: record.payload.requestId,
      turnId: record.payload.turnId,
      toolCallId: record.payload.toolCallId,
      optionId: record.payload.optionId,
      outcome: record.payload.outcome,
    },
  })

const projectDevicePaired = (record: DevicePairedRecord): Event =>
  EventSchema.parse({
    type: "device.paired",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    payload: {
      deviceId: record.payload.deviceId,
      name: record.payload.name,
      platform: record.payload.platform,
    },
  })

const projectDeviceConnected = (record: DeviceConnectedRecord): Event =>
  EventSchema.parse({
    type: "device.connected",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    payload: { deviceId: record.payload.deviceId },
  })

const projectDeviceDisconnected = (record: DeviceDisconnectedRecord): Event =>
  EventSchema.parse({
    type: "device.disconnected",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    payload: { deviceId: record.payload.deviceId },
  })

const projectDeviceRevoked = (record: DeviceRevokedRecord): Event =>
  EventSchema.parse({
    type: "device.revoked",
    cursor: eventCursorToString(record.cursor),
    occurredAt: record.occurredAt,
    payload: { deviceId: record.payload.deviceId },
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
    case "session.permission.resolved":
      return projectSessionPermissionResolved(record)
    case "device.paired":
      return projectDevicePaired(record)
    case "device.connected":
      return projectDeviceConnected(record)
    case "device.disconnected":
      return projectDeviceDisconnected(record)
    case "device.revoked":
      return projectDeviceRevoked(record)
  }
}

export const projectLifecycleEvents = (
  records: ReadonlyArray<LifecycleJournalRecord>,
): Event[] => records.map(projectLifecycleEvent)
