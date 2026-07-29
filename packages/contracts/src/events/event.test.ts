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

  test("rejects milestone 2 device events", () => {
    expect(() =>
      EventSchema.parse({
        cursor: "1",
        type: "device.connected",
        occurredAt: "2026-07-24T12:01:00.000Z",
        payload: { deviceId: "device-1" },
      }),
    ).toThrow()
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
