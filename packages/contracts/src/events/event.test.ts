import { describe, expect, test } from "bun:test"
import { EventCursorSchema } from "./primitives"
import { EventSchema } from "./event"
import { EventFrameSchema, EventStreamQuerySchema } from "./stream"

describe("EventSchema", () => {
  test("accepts a server.status event with decimal cursor", () => {
    const event = {
      cursor: "0",
      type: "server.status",
      occurredAt: "2026-07-24T12:00:00.000Z",
      payload: { state: "online" },
    }

    expect(EventSchema.parse(event)).toEqual(event)
  })

  test("accepts a session.output.delta event with session scope", () => {
    const event = {
      cursor: "42",
      type: "session.output.delta",
      occurredAt: "2026-07-24T12:01:00.000Z",
      workspaceId: "ws-agent-server",
      sessionId: "session-auth",
      payload: {
        turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
        text: "Inspecting the auth flow.",
      },
    }

    expect(EventSchema.parse(event)).toEqual(event)
  })

  test("accepts turn.started with turnId and text", () => {
    const event = {
      cursor: "10",
      type: "turn.started",
      occurredAt: "2026-07-24T12:01:00.000Z",
      workspaceId: "ws-agent-server",
      sessionId: "session-auth",
      payload: {
        turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
        text: "operator prompt",
      },
    }

    expect(EventSchema.parse(event)).toEqual(event)
  })

  test("accepts session.thought.delta with turnId and text", () => {
    const event = {
      cursor: "11",
      type: "session.thought.delta",
      occurredAt: "2026-07-24T12:01:00.000Z",
      workspaceId: "ws-agent-server",
      sessionId: "session-auth",
      payload: {
        turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
        text: "thinking aloud",
      },
    }

    expect(EventSchema.parse(event)).toEqual(event)
  })

  test("accepts workspace.changed deleted without state", () => {
    const event = {
      cursor: "7",
      type: "workspace.changed",
      occurredAt: "2026-07-24T12:02:00.000Z",
      workspaceId: "ws-agent-server",
      payload: {
        workspaceId: "ws-agent-server",
        change: "deleted",
      },
    }

    expect(EventSchema.parse(event)).toEqual(event)
  })

  test("rejects prototype agent event types", () => {
    expect(() =>
      EventSchema.parse({
        cursor: "1",
        type: "agent.output.delta",
        occurredAt: "2026-07-24T12:01:00.000Z",
        workspaceId: "ws-agent-server",
        agentId: "agent-auth",
        payload: { text: "Nope" },
      }),
    ).toThrow()
  })

  test("accepts device lifecycle events", () => {
    const paired = {
      cursor: "1",
      type: "device.paired",
      occurredAt: "2026-07-24T12:01:00.000Z",
      payload: {
        deviceId: "device_1",
        name: "Paired device",
        platform: "android",
      },
    }
    const connected = {
      cursor: "2",
      type: "device.connected",
      occurredAt: "2026-07-24T12:01:00.000Z",
      payload: { deviceId: "device_1" },
    }
    const disconnected = {
      cursor: "3",
      type: "device.disconnected",
      occurredAt: "2026-07-24T12:01:01.000Z",
      payload: { deviceId: "device_1" },
    }
    const revoked = {
      cursor: "4",
      type: "device.revoked",
      occurredAt: "2026-07-24T12:01:02.000Z",
      payload: { deviceId: "device_1" },
    }

    expect(EventSchema.parse(paired)).toEqual(paired)
    expect(EventSchema.parse(connected)).toEqual(connected)
    expect(EventSchema.parse(disconnected)).toEqual(disconnected)
    expect(EventSchema.parse(revoked)).toEqual(revoked)
  })

  test("accepts session.tool.completed without tool name", () => {
    expect(() =>
      EventSchema.parse({
        type: "session.tool.completed",
        cursor: "12",
        occurredAt: "2026-07-24T12:00:00.000Z",
        workspaceId: "ws_01",
        sessionId: "sess_01",
        payload: {
          turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
          toolCallId: "tool-1",
          status: "completed",
        },
      }),
    ).not.toThrow()
  })
})

describe("EventCursorSchema", () => {
  test("accepts zero and unsigned decimal strings", () => {
    expect(EventCursorSchema.parse("0")).toBe("0")
    expect(EventCursorSchema.parse("42")).toBe("42")
    expect(EventCursorSchema.parse("9007199254740991")).toBe("9007199254740991")
  })

  test("rejects signed, empty, and non-decimal cursors", () => {
    expect(() => EventCursorSchema.parse("")).toThrow()
    expect(() => EventCursorSchema.parse("-1")).toThrow()
    expect(() => EventCursorSchema.parse("01")).toThrow()
    expect(() => EventCursorSchema.parse("evt_01")).toThrow()
  })
})

describe("EventStreamQuerySchema", () => {
  test("accepts optional filters and cursor", () => {
    expect(
      EventStreamQuerySchema.parse({
        cursor: "0",
        workspaceId: "ws-1",
        sessionId: "sess-1",
      }),
    ).toEqual({
      cursor: "0",
      workspaceId: "ws-1",
      sessionId: "sess-1",
    })
  })
})

describe("EventFrameSchema", () => {
  test("accepts 1 to 500 events", () => {
    const event = {
      cursor: "1",
      type: "server.status",
      occurredAt: "2026-07-24T12:00:00.000Z",
      payload: { state: "online" },
    }

    expect(EventFrameSchema.parse([event])).toEqual([event])
    expect(EventFrameSchema.parse(Array.from({ length: 500 }, () => event))).toHaveLength(500)
    expect(() => EventFrameSchema.parse([])).toThrow()
    expect(() => EventFrameSchema.parse(Array.from({ length: 501 }, () => event))).toThrow()
  })
})
