import { describe, expect, test } from "bun:test"
import { Event } from "contracts/events/event"
import { SessionCollectionSchema } from "contracts/http/session"
import { applySessionListEvents } from "./apply.session.list.events"

const collection = SessionCollectionSchema.parse({
  items: [
    {
      id: "sess_01SELECTED000000000000001",
      workspaceId: "ws_01",
      agentId: "cursor",
      name: "Selected chat",
      state: "idle",
      createdAt: "2026-07-24T12:00:00.000Z",
      lastUsedAt: "2026-07-24T12:00:00.000Z",
      archivedAt: null,
    },
    {
      id: "sess_01OTHER00000000000000002",
      workspaceId: "ws_01",
      agentId: "cursor",
      name: "Background chat",
      state: "idle",
      createdAt: "2026-07-24T12:01:00.000Z",
      lastUsedAt: "2026-07-24T12:01:00.000Z",
      archivedAt: null,
    },
  ],
  page: { limit: 100, count: 2 },
})

const sessionStateEvent = (params: {
  sessionId: string
  state: "idle" | "running" | "error"
  cursor: string
}): Event => ({
  type: "session.state",
  cursor: params.cursor,
  occurredAt: "2026-07-24T12:02:00.000Z",
  workspaceId: "ws_01",
  sessionId: params.sessionId,
  payload: {
    sessionId: params.sessionId,
    state: params.state,
  },
})

describe("applySessionListEvents", () => {
  test("updates matching session state from session.state", () => {
    const next = applySessionListEvents({
      collection,
      events: [
        sessionStateEvent({
          sessionId: "sess_01OTHER00000000000000002",
          state: "running",
          cursor: "10",
        }),
      ],
    })

    expect(next.items[0]?.state).toBe("idle")
    expect(next.items[1]?.state).toBe("running")
    expect(next.items[1]?.name).toBe("Background chat")
  })

  test("ignores session.state for sessions not in the collection", () => {
    const next = applySessionListEvents({
      collection,
      events: [
        sessionStateEvent({
          sessionId: "sess_01UNKNOWN00000000000003",
          state: "running",
          cursor: "11",
        }),
      ],
    })

    expect(next).toBe(collection)
  })

  test("keeps last session.state when the same session appears twice", () => {
    const next = applySessionListEvents({
      collection,
      events: [
        sessionStateEvent({
          sessionId: "sess_01OTHER00000000000000002",
          state: "running",
          cursor: "12",
        }),
        sessionStateEvent({
          sessionId: "sess_01OTHER00000000000000002",
          state: "error",
          cursor: "13",
        }),
      ],
    })

    expect(next.items[1]?.state).toBe("error")
  })
})
