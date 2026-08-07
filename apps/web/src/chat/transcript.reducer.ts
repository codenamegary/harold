import { Event } from "contracts/events/event"
import { SessionState } from "contracts/http/session"
import { ToolCallStatus, ToolKind } from "contracts/events/primitives"

export type TranscriptUserRow = {
  kind: "user"
  turnId: string
  text: string
}

export type TranscriptThinkingRow = {
  kind: "thinking"
  turnId: string
  text: string
}

export type TranscriptAssistantRow = {
  kind: "assistant"
  turnId: string
  text: string
}

export type TranscriptToolRow = {
  kind: "tool"
  turnId: string
  toolCallId: string
  toolName: string
  toolKind: ToolKind
  status: ToolCallStatus | "pending"
  detail?: string
}

export type TranscriptRow =
  | TranscriptUserRow
  | TranscriptThinkingRow
  | TranscriptAssistantRow
  | TranscriptToolRow

export type TranscriptState = {
  rows: ReadonlyArray<TranscriptRow>
  cursor: number
  sessionState: SessionState | null
}

export const emptyTranscript: TranscriptState = {
  rows: [],
  cursor: 0,
  sessionState: null,
}

const updateLastMatching = <T extends TranscriptRow>(
  rows: ReadonlyArray<TranscriptRow>,
  match: (row: TranscriptRow) => row is T,
  update: (row: T) => T,
): ReadonlyArray<TranscriptRow> => {
  const index = rows.findLastIndex((row) => match(row))
  if (index < 0) {
    return rows
  }

  const row = rows[index]
  if (row === undefined || !match(row)) {
    return rows
  }

  return [...rows.slice(0, index), update(row), ...rows.slice(index + 1)]
}

const isThinkingForTurn =
  (turnId: string) =>
  (row: TranscriptRow): row is TranscriptThinkingRow =>
    row.kind === "thinking" && row.turnId === turnId

const isAssistantForTurn =
  (turnId: string) =>
  (row: TranscriptRow): row is TranscriptAssistantRow =>
    row.kind === "assistant" && row.turnId === turnId

const isToolForCall =
  (toolCallId: string) =>
  (row: TranscriptRow): row is TranscriptToolRow =>
    row.kind === "tool" && row.toolCallId === toolCallId

export const foldTranscriptEvent = (
  state: TranscriptState,
  event: Event,
): TranscriptState => {
  const withCursor = {
    ...state,
    cursor: Number(event.cursor),
  }

  switch (event.type) {
    case "turn.started":
      return {
        ...withCursor,
        rows: [
          ...withCursor.rows,
          {
            kind: "user",
            turnId: event.payload.turnId,
            text: event.payload.text,
          },
        ],
      }
    case "session.thought.delta": {
      const existing = withCursor.rows.findLast(isThinkingForTurn(event.payload.turnId))
      if (existing === undefined) {
        return {
          ...withCursor,
          rows: [
            ...withCursor.rows,
            {
              kind: "thinking",
              turnId: event.payload.turnId,
              text: event.payload.text,
            },
          ],
        }
      }

      return {
        ...withCursor,
        rows: updateLastMatching(
          withCursor.rows,
          isThinkingForTurn(event.payload.turnId),
          (row) => ({ ...row, text: `${row.text}${event.payload.text}` }),
        ),
      }
    }
    case "session.output.delta": {
      const existing = withCursor.rows.findLast(isAssistantForTurn(event.payload.turnId))
      if (existing === undefined) {
        return {
          ...withCursor,
          rows: [
            ...withCursor.rows,
            {
              kind: "assistant",
              turnId: event.payload.turnId,
              text: event.payload.text,
            },
          ],
        }
      }

      return {
        ...withCursor,
        rows: updateLastMatching(
          withCursor.rows,
          isAssistantForTurn(event.payload.turnId),
          (row) => ({ ...row, text: `${row.text}${event.payload.text}` }),
        ),
      }
    }
    case "session.output.complete": {
      const existing = withCursor.rows.findLast(isAssistantForTurn(event.payload.turnId))
      if (existing === undefined) {
        return {
          ...withCursor,
          rows: [
            ...withCursor.rows,
            {
              kind: "assistant",
              turnId: event.payload.turnId,
              text: event.payload.text,
            },
          ],
        }
      }

      return {
        ...withCursor,
        rows: updateLastMatching(
          withCursor.rows,
          isAssistantForTurn(event.payload.turnId),
          (row) => ({ ...row, text: event.payload.text }),
        ),
      }
    }
    case "session.tool.started":
      return {
        ...withCursor,
        rows: [
          ...withCursor.rows,
          {
            kind: "tool",
            turnId: event.payload.turnId,
            toolCallId: event.payload.toolCallId,
            toolName: event.payload.toolName,
            toolKind: event.payload.toolKind,
            status: "pending",
            ...(event.payload.detail !== undefined
              ? { detail: event.payload.detail }
              : {}),
          },
        ],
      }
    case "session.tool.completed":
      return {
        ...withCursor,
        rows: updateLastMatching(
          withCursor.rows,
          isToolForCall(event.payload.toolCallId),
          (row) => ({
            ...row,
            ...(event.payload.toolName !== undefined
              ? { toolName: event.payload.toolName }
              : {}),
            ...(event.payload.toolKind !== undefined
              ? { toolKind: event.payload.toolKind }
              : {}),
            ...(event.payload.detail !== undefined
              ? { detail: event.payload.detail }
              : {}),
            status: event.payload.status,
          }),
        ),
      }
    case "session.state":
      return {
        ...withCursor,
        sessionState: event.payload.state,
      }
    default:
      return withCursor
  }
}

export const foldTranscriptEvents = (
  state: TranscriptState,
  events: ReadonlyArray<Event>,
): TranscriptState =>
  events.reduce((current, event) => foldTranscriptEvent(current, event), state)
