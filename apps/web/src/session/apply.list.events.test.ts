import { describe, expect, test } from "bun:test"
import { Event } from "contracts/events/event"
import { SessionCollectionSchema } from "contracts/http/session"
import { applySessionListEvents } from "./apply.list.events"

const collection = SessionCollectionSchema.parse({
  items: [
    {
      agentId: "cursor",
      sessionId: "sess_01SELECTED000000000000001",
      cwd: "/home/operator/agent-server",
      title: "Selected chat",
      updatedAt: "2026-07-24T12:00:00.000Z",
    },
    {
      agentId: "cursor",
      sessionId: "sess_01OTHER00000000000000002",
      cwd: "/home/operator/agent-server",
      title: "Background chat",
      updatedAt: "2026-07-24T12:01:00.000Z",
    },
  ],
})

const sessionStateEvent = (params: {
  sessionId: string
  state: "idle" | "running" | "error" | "archived"
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
  test("keeps catalog rows when session.state is not archived", () => {
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

    expect(next.items).toHaveLength(2)
    expect(next.items[1]?.sessionId).toBe("sess_01OTHER00000000000000002")
    expect(next.items[1]?.title).toBe("Background chat")
  })

  test("removes sessions that become archived", () => {
    const next = applySessionListEvents({
      collection,
      events: [
        sessionStateEvent({
          sessionId: "sess_01OTHER00000000000000002",
          state: "archived",
          cursor: "14",
        }),
      ],
    })

    expect(next.items).toHaveLength(1)
    expect(next.items[0]?.sessionId).toBe("sess_01SELECTED000000000000001")
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

  test("keeps catalog row when the same session receives multiple non-archived states", () => {
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

    expect(next.items).toHaveLength(2)
    expect(next.items[1]?.sessionId).toBe("sess_01OTHER00000000000000002")
  })
})
