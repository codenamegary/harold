import { describe, expect, test } from "bun:test"
import { CursorSchema } from "../http/primitives"
import { EventSchema } from "./event"

describe("EventSchema", () => {
  test("accepts a server.status event", () => {
    const event = {
      cursor: "evt_01JFC8C7E77NQCFH0RF9Z22JHH",
      type: "server.status",
      occurredAt: "2026-07-24T12:00:00.000Z",
      payload: { state: "online" },
    };

    expect(EventSchema.parse(event)).toEqual(event);
  });

  test("accepts a session.output.delta event with session scope", () => {
    const event = {
      cursor: "evt_01JFC8C7E77NQCFH0RF9Z22JHH",
      type: "session.output.delta",
      occurredAt: "2026-07-24T12:01:00.000Z",
      workspaceId: "ws-agent-server",
      sessionId: "session-auth",
      payload: { text: "Inspecting the auth flow." },
    };

    expect(EventSchema.parse(event)).toEqual(event);
  });

  test("rejects prototype agent event types", () => {
    expect(() =>
      EventSchema.parse({
        cursor: "evt_01",
        type: "agent.output.delta",
        occurredAt: "2026-07-24T12:01:00.000Z",
        workspaceId: "ws-agent-server",
        agentId: "agent-auth",
        payload: { text: "Nope" },
      }),
    ).toThrow();
  });

  test("rejects milestone 2 device events", () => {
    expect(() =>
      EventSchema.parse({
        cursor: "evt_01",
        type: "device.connected",
        occurredAt: "2026-07-24T12:01:00.000Z",
        payload: { deviceId: "device-1" },
      }),
    ).toThrow()
  })
})

describe("CursorSchema", () => {
  test("is shared from http primitives", () => {
    expect(CursorSchema.parse("evt_01JFC8C7E77NQCFH0RF9Z22JHH")).toBe(
      "evt_01JFC8C7E77NQCFH0RF9Z22JHH",
    )
  })
})
