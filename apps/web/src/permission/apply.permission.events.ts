import { Event } from "contracts/events/event"
import { PermissionRequest } from "contracts/http/permission"

const toPendingRequest = (event: Extract<Event, { type: "session.permission.requested" }>): PermissionRequest => {
  if (event.sessionId === undefined) {
    throw new Error("permission request event missing session id")
  }

  return {
    id: event.payload.requestId,
    sessionId: event.sessionId,
    turnId: event.payload.turnId,
    toolCallId: event.payload.toolCallId,
    toolName: event.payload.toolName,
    status: "pending",
    options: [...event.payload.options],
    createdAt: event.occurredAt,
  }
}

export const applyPermissionEvents = (
  current: ReadonlyArray<PermissionRequest>,
  events: ReadonlyArray<Event>,
): PermissionRequest[] => {
  return events.reduce<PermissionRequest[]>((pending, event) => {
    if (event.type === "session.permission.requested") {
      const next = toPendingRequest(event)
      const withoutDuplicate = pending.filter((item) => item.id !== next.id)
      return [...withoutDuplicate, next].toSorted((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      )
    }

    if (event.type === "session.permission.resolved") {
      return pending.filter((item) => item.id !== event.payload.requestId)
    }

    return pending
  }, [...current])
}

export const mergePendingRead = (
  current: ReadonlyArray<PermissionRequest>,
  fromRead: ReadonlyArray<PermissionRequest>,
): PermissionRequest[] => {
  const byId = new Map(current.map((item) => [item.id, item]))
  fromRead.forEach((item) => {
    byId.set(item.id, item)
  })

  return [...byId.values()].toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))
}

export const activePermissionRequest = (
  pending: ReadonlyArray<PermissionRequest>,
): PermissionRequest | null =>
  [...pending].toSorted((left, right) => left.createdAt.localeCompare(right.createdAt))[0] ?? null
