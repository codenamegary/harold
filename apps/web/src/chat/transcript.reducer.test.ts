import { describe, expect, test } from "bun:test"
import { Event } from "contracts/events/event"
import {
  emptyTranscript,
  foldTranscriptEvent,
  foldTranscriptEvents,
  TranscriptState,
} from "./transcript.reducer"

const baseEvent = {
  cursor: "1",
  occurredAt: "2026-07-24T12:00:00.000Z",
  workspaceId: "ws_01",
  sessionId: "sess_01",
} as const

const turnStarted = (overrides: {
  cursor?: string
  turnId?: string
  text?: string
}): Event => ({
  ...baseEvent,
  cursor: overrides.cursor ?? "1",
  type: "turn.started",
  payload: {
    turnId: overrides.turnId ?? "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
    text: overrides.text ?? "Explain auth",
  },
})

const thoughtDelta = (overrides: {
  cursor?: string
  turnId?: string
  text?: string
}): Event => ({
  ...baseEvent,
  cursor: overrides.cursor ?? "2",
  type: "session.thought.delta",
  payload: {
    turnId: overrides.turnId ?? "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
    text: overrides.text ?? "Thinking…",
  },
})

const outputDelta = (overrides: {
  cursor?: string
  turnId?: string
  text?: string
}): Event => ({
  ...baseEvent,
  cursor: overrides.cursor ?? "3",
  type: "session.output.delta",
  payload: {
    turnId: overrides.turnId ?? "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
    text: overrides.text ?? "Hello",
  },
})

const toolStarted = (overrides: {
  cursor?: string
  toolCallId?: string
  toolName?: string
}): Event => ({
  ...baseEvent,
  cursor: overrides.cursor ?? "4",
  type: "session.tool.started",
  payload: {
    turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
    toolCallId: overrides.toolCallId ?? "tool_01",
    toolName: overrides.toolName ?? "read",
    toolKind: "read",
  },
})

const toolCompleted = (overrides: {
  cursor?: string
  toolCallId?: string
  status?: "completed" | "failed"
}): Event => ({
  ...baseEvent,
  cursor: overrides.cursor ?? "5",
  type: "session.tool.completed",
  payload: {
    turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
    toolCallId: overrides.toolCallId ?? "tool_01",
    toolName: "read",
    toolKind: "read",
    status: overrides.status ?? "completed",
  },
})

const sessionState = (overrides: {
  cursor?: string
  state: "running" | "idle"
}): Event => ({
  ...baseEvent,
  cursor: overrides.cursor ?? "6",
  type: "session.state",
  payload: {
    sessionId: "sess_01",
    state: overrides.state,
  },
})

describe("foldTranscriptEvent", () => {
  test("turn.started appends a user row", () => {
    const next = foldTranscriptEvent(emptyTranscript, turnStarted({}))

    expect(next.rows).toEqual([
      {
        kind: "user",
        turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
        text: "Explain auth",
      },
    ])
    expect(next.cursor).toBe(1)
  })

  test("thought and output deltas append and accumulate", () => {
    const afterThought = foldTranscriptEvents(emptyTranscript, [
      turnStarted({}),
      thoughtDelta({ text: "Hmm" }),
      thoughtDelta({ cursor: "3", text: " more" }),
      outputDelta({ cursor: "4", text: "Hi" }),
      outputDelta({ cursor: "5", text: " there" }),
    ])

    expect(afterThought.rows).toEqual([
      {
        kind: "user",
        turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
        text: "Explain auth",
      },
      {
        kind: "thinking",
        turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
        text: "Hmm more",
      },
      {
        kind: "assistant",
        turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
        text: "Hi there",
      },
    ])
  })

  test("tool started and completed update the tool row", () => {
    const next = foldTranscriptEvents(emptyTranscript, [
      turnStarted({}),
      toolStarted({}),
      toolCompleted({}),
    ])

    expect(next.rows).toEqual([
      {
        kind: "user",
        turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
        text: "Explain auth",
      },
      {
        kind: "tool",
        turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
        toolCallId: "tool_01",
        toolName: "read",
        toolKind: "read",
        status: "completed",
      },
    ])
  })

  test("status-only tool completed keeps the started tool name", () => {
    const next = foldTranscriptEvents(emptyTranscript, [
      turnStarted({}),
      toolStarted({ toolName: "read_file" }),
      {
        ...baseEvent,
        cursor: "5",
        type: "session.tool.completed",
        payload: {
          turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
          toolCallId: "tool_01",
          status: "completed",
        },
      },
    ])

    expect(next.rows).toEqual([
      {
        kind: "user",
        turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
        text: "Explain auth",
      },
      {
        kind: "tool",
        turnId: "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
        toolCallId: "tool_01",
        toolName: "read_file",
        toolKind: "read",
        status: "completed",
      },
    ])
  })

  test("session.state updates running flag and cursor", () => {
    const running: TranscriptState = foldTranscriptEvent(
      emptyTranscript,
      sessionState({ state: "running" }),
    )
    expect(running.sessionState).toBe("running")
    expect(running.cursor).toBe(6)

    const idle = foldTranscriptEvent(running, sessionState({ cursor: "7", state: "idle" }))
    expect(idle.sessionState).toBe("idle")
    expect(idle.cursor).toBe(7)
  })

  test("replay from empty rebuilds user thinking assistant and tools", () => {
    const replayed = foldTranscriptEvents(emptyTranscript, [
      turnStarted({ cursor: "1" }),
      thoughtDelta({ cursor: "2", text: "plan" }),
      toolStarted({ cursor: "3" }),
      outputDelta({ cursor: "4", text: "done" }),
      toolCompleted({ cursor: "5" }),
      sessionState({ cursor: "6", state: "idle" }),
    ])

    expect(replayed.rows.map((row) => row.kind)).toEqual([
      "user",
      "thinking",
      "tool",
      "assistant",
    ])
    expect(replayed.sessionState).toBe("idle")
    expect(replayed.cursor).toBe(6)
  })
})
