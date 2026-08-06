import { describe, expect, test } from "bun:test"
import { Event } from "contracts/events/event"
import { PermissionRequest } from "contracts/http/permission"
import { activePermissionRequest, applyPermissionEvents } from "./apply.permission.events"

const sampleRequest = (id: string, createdAt: string): PermissionRequest => ({
  id,
  sessionId: "sess-1",
  turnId: "turn_01KZBHZYTYC67MG8E03KCY6NY0",
  toolCallId: "tool-1",
  toolName: "fake-tool",
  status: "pending",
  options: [{ optionId: "allow-once", name: "Allow once" }],
  createdAt,
})

const requestedEvent = (
  requestId: string,
  occurredAt: string,
): Extract<Event, { type: "session.permission.requested" }> => ({
  type: "session.permission.requested",
  cursor: "1",
  occurredAt,
  workspaceId: "ws-1",
  sessionId: "sess-1",
  payload: {
    requestId,
    turnId: "turn_01KZBHZYTYC67MG8E03KCY6NY0",
    toolCallId: "tool-1",
    toolName: "fake-tool",
    options: [{ optionId: "allow-once", name: "Allow once" }],
  },
})

describe("apply.permission.events", () => {
  test("activePermissionRequest returns oldest pending only", () => {
    const pending = [
      sampleRequest("perm-2", "2026-08-06T12:00:02.000Z"),
      sampleRequest("perm-1", "2026-08-06T12:00:01.000Z"),
    ]

    expect(activePermissionRequest(pending)?.id).toBe("perm-1")
  })

  test("applyPermissionEvents removes resolved requests", () => {
    const current = [sampleRequest("perm-1", "2026-08-06T12:00:01.000Z")]
    const next = applyPermissionEvents(current, [
      {
        type: "session.permission.resolved",
        cursor: "2",
        occurredAt: "2026-08-06T12:00:03.000Z",
        workspaceId: "ws-1",
        sessionId: "sess-1",
        payload: {
          requestId: "perm-1",
          turnId: "turn_01KZBHZYTYC67MG8E03KCY6NY0",
          toolCallId: "tool-1",
          optionId: "allow-once",
          outcome: "selected",
        },
      },
    ])

    expect(next).toEqual([])
    expect(
      activePermissionRequest(
        applyPermissionEvents(next, [requestedEvent("perm-2", "2026-08-06T12:00:04.000Z")]),
      )?.id,
    ).toBe("perm-2")
  })
})
