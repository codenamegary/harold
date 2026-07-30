import { describe, expect, test } from "bun:test"
import { JournalAppendRecordSchema } from "./journal-record"

describe("JournalAppendRecordSchema", () => {
  test("rejects unknown payload fields before persistence", () => {
    expect(() =>
      JournalAppendRecordSchema.parse({
        schemaVersion: 1,
        kind: "server.status",
        occurredAt: "2026-07-24T12:00:00.000Z",
        payload: { state: "online", secret: "token" },
      }),
    ).toThrow()
  })

  test("rejects secret-bearing ACP notification fields", () => {
    expect(() =>
      JournalAppendRecordSchema.parse({
        schemaVersion: 1,
        kind: "acp.notification",
        occurredAt: "2026-07-24T12:00:00.000Z",
        workspaceId: "ws-1",
        sessionId: "sess-1",
        protocolVersion: 1,
        direction: "agent_to_agent_server",
        phase: "live",
        payload: {
          updateKind: "agent_message_chunk",
          text: "hello",
          rawInput: "{}",
        },
      }),
    ).toThrow()
  })

  test("accepts a session-scoped turn.failed record", () => {
    const record = {
      schemaVersion: 1,
      kind: "turn.failed",
      occurredAt: "2026-07-24T12:00:00.000Z",
      workspaceId: "ws-1",
      sessionId: "sess-1",
      turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
      payload: { failureCode: "transport_error" },
    }

    expect(JournalAppendRecordSchema.parse(record)).toEqual(record)
  })

  test("accepts turn.started with sanitized prompt text", () => {
    const record = {
      schemaVersion: 1,
      kind: "turn.started",
      occurredAt: "2026-07-24T12:00:00.000Z",
      workspaceId: "ws-1",
      sessionId: "sess-1",
      turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
      payload: { text: "operator prompt" },
    }

    expect(JournalAppendRecordSchema.parse(record)).toEqual(record)
  })

  test("defaults missing turn.started text to empty string", () => {
    const record = {
      schemaVersion: 1,
      kind: "turn.started",
      occurredAt: "2026-07-24T12:00:00.000Z",
      workspaceId: "ws-1",
      sessionId: "sess-1",
      turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
      payload: {},
    }

    expect(JournalAppendRecordSchema.parse(record)).toEqual({
      ...record,
      payload: { text: "" },
    })
  })

  test("accepts agent_thought_chunk notification with text", () => {
    const record = {
      schemaVersion: 1,
      kind: "acp.notification",
      occurredAt: "2026-07-24T12:00:00.000Z",
      workspaceId: "ws-1",
      sessionId: "sess-1",
      protocolVersion: 1,
      direction: "agent_to_agent_server",
      phase: "live",
      payload: {
        updateKind: "agent_thought_chunk",
        text: "thinking aloud",
      },
    }

    expect(JournalAppendRecordSchema.parse(record)).toEqual(record)
  })
})
