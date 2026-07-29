import { describe, expect, test } from "bun:test"
import { EventSchema } from "contracts/events/event"
import { ParsedJournalRecord } from "./journal.repository"
import { parseAcpJournalRecord } from "./acp.models"
import { projectAcpEvent, projectAcpEvents } from "./acp.projectors"

const turnId = "turn_01JFC8C7E77NQCFH0RF9Z22JHH"

const baseRecord = {
  schemaVersion: 1,
  occurredAt: "2026-07-24T12:00:00.000Z",
  workspaceId: "ws_test",
  sessionId: "sess_test",
  sessionSequence: 1,
  protocolVersion: 1,
  direction: "agent_to_agent_server" as const,
  method: null,
} satisfies Omit<ParsedJournalRecord, "cursor" | "kind" | "payload" | "turnId" | "phase">

describe("projectAcpEvent", () => {
  test("maps agent_message_chunk to session.output.delta", () => {
    const record: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 10n,
      kind: "acp.notification",
      turnId,
      phase: "live",
      payload: { updateKind: "agent_message_chunk", text: "Hello" },
    }

    const events = projectAcpEvent(parseAcpJournalRecord(record), { outputChunksByTurnId: {} })
    expect(events).toEqual([
      EventSchema.parse({
        type: "session.output.delta",
        cursor: "10",
        occurredAt: "2026-07-24T12:00:00.000Z",
        workspaceId: "ws_test",
        sessionId: "sess_test",
        payload: { turnId, text: "Hello" },
      }),
    ])
  })

  test("maps tool_call and tool_call_update to tool events", () => {
    const started: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 11n,
      kind: "acp.notification",
      turnId,
      phase: "live",
      payload: {
        updateKind: "tool_call",
        toolCallId: "tool-1",
        toolName: "read_file",
        toolKind: "read",
      },
    }
    const completed: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 12n,
      kind: "acp.notification",
      turnId,
      phase: "live",
      payload: {
        updateKind: "tool_call_update",
        toolCallId: "tool-1",
        toolName: "read_file",
        toolKind: "read",
        status: "completed",
      },
    }

    expect(projectAcpEvent(parseAcpJournalRecord(started), { outputChunksByTurnId: {} })[0]?.type).toBe(
      "session.tool.started",
    )
    expect(projectAcpEvent(parseAcpJournalRecord(completed), { outputChunksByTurnId: {} })[0]?.type).toBe(
      "session.tool.completed",
    )
  })

  test("maps permission requests", () => {
    const record: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 13n,
      kind: "acp.permission",
      turnId,
      phase: "live",
      method: "session/request_permission",
      payload: { toolCallId: "tool-perm", toolName: "write_file" },
    }

    const events = projectAcpEvent(parseAcpJournalRecord(record), { outputChunksByTurnId: {} })
    expect(events[0]?.type).toBe("session.permission.requested")
  })

  test("suppresses load_replay notifications from public stream", () => {
    const record: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 14n,
      kind: "acp.notification",
      turnId,
      phase: "load_replay",
      payload: { updateKind: "agent_message_chunk", text: "Replayed" },
    }

    expect(projectAcpEvent(parseAcpJournalRecord(record), { outputChunksByTurnId: {} })).toEqual([])
  })

  test("folds output.complete at turn completion", () => {
    const chunkA: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 15n,
      kind: "acp.notification",
      turnId,
      phase: "live",
      payload: { updateKind: "agent_message_chunk", text: "Hello" },
    }
    const chunkB: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 16n,
      kind: "acp.notification",
      turnId,
      phase: "live",
      payload: { updateKind: "agent_message_chunk", text: " world" },
    }
    const completed: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 17n,
      kind: "turn.completed",
      turnId,
      phase: null,
      protocolVersion: null,
      direction: null,
      payload: {},
    }

    const contextRecords = [parseAcpJournalRecord(chunkA), parseAcpJournalRecord(chunkB)]
    const events = projectAcpEvents([parseAcpJournalRecord(completed)], contextRecords)

    expect(events.map((event) => event.type)).toEqual(["session.output.complete", "turn.completed"])
    expect(
      events.find((event) => event.type === "session.output.complete")?.payload,
    ).toEqual({ turnId, text: "Hello world" })
  })

  test("handles unknown update kinds without throwing", () => {
    const record: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 18n,
      kind: "acp.notification",
      turnId,
      phase: "live",
      payload: { updateKind: "unknown", sourceKind: "future_kind" },
    }

    expect(() => projectAcpEvent(parseAcpJournalRecord(record), { outputChunksByTurnId: {} })).not.toThrow()
    expect(projectAcpEvent(parseAcpJournalRecord(record), { outputChunksByTurnId: {} })).toEqual([])
  })

  test("maps turn.failed and turn.cancelled", () => {
    const failed: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 19n,
      kind: "turn.failed",
      turnId,
      phase: null,
      protocolVersion: null,
      direction: null,
      payload: { failureCode: "prompt_failed" },
    }
    const cancelled: ParsedJournalRecord = {
      ...baseRecord,
      cursor: 20n,
      kind: "turn.cancelled",
      turnId,
      phase: null,
      protocolVersion: null,
      direction: null,
      payload: {},
    }

    expect(projectAcpEvent(parseAcpJournalRecord(failed), { outputChunksByTurnId: {} })[0]?.type).toBe(
      "turn.failed",
    )
    expect(projectAcpEvent(parseAcpJournalRecord(cancelled), { outputChunksByTurnId: {} })[0]?.type).toBe(
      "turn.cancelled",
    )
  })
})
