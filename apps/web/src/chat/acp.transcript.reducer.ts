import { SessionState } from "contracts/http/session"
import { ParsedAcpUpdate } from "./acp.update"
import {
  TranscriptAssistantRow,
  TranscriptRow,
  TranscriptThinkingRow,
  TranscriptToolRow,
  TranscriptUserRow,
} from "./transcript.reducer"

export type AcpTranscriptState = {
  rows: ReadonlyArray<TranscriptRow>
  sessionState: SessionState | null
  currentTurnId: string
  live: boolean
}

export const emptyAcpTranscript: AcpTranscriptState = {
  rows: [],
  sessionState: null,
  currentTurnId: "replay",
  live: false,
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

const isUserForTurn =
  (turnId: string) =>
  (row: TranscriptRow): row is TranscriptUserRow =>
    row.kind === "user" && row.turnId === turnId

const isToolForCall =
  (toolCallId: string) =>
  (row: TranscriptRow): row is TranscriptToolRow =>
    row.kind === "tool" && row.toolCallId === toolCallId

const turnHasUserRow = (rows: ReadonlyArray<TranscriptRow>, turnId: string) =>
  rows.some((row) => row.kind === "user" && row.turnId === turnId)

const turnHasAgentContent = (rows: ReadonlyArray<TranscriptRow>, turnId: string) =>
  rows.some(
    (row) =>
      row.turnId === turnId &&
      (row.kind === "assistant" || row.kind === "thinking" || row.kind === "tool"),
  )

const nextReplayTurnId = (current: string): string => {
  const match = /^replay(?:-(\d+))?$/.exec(current)
  if (match === null) {
    return `${current}-2`
  }

  const serial = match[1] === undefined ? 2 : Number(match[1]) + 1
  return `replay-${serial}`
}

const withLiveRunning = (state: AcpTranscriptState): AcpTranscriptState => {
  if (!state.live) {
    return state
  }

  return {
    ...state,
    sessionState: "running",
  }
}

export const beginUserTurn = (
  state: AcpTranscriptState,
  params: { turnId: string; text: string },
): AcpTranscriptState => ({
  rows: [
    ...state.rows,
    {
      kind: "user",
      turnId: params.turnId,
      text: params.text,
    },
  ],
  sessionState: "running",
  currentTurnId: params.turnId,
  live: state.live,
})

export const foldAcpUpdate = (
  state: AcpTranscriptState,
  parsed: ParsedAcpUpdate,
): AcpTranscriptState => {
  const turnId = state.currentTurnId

  switch (parsed.kind) {
    case "ignored":
      return state
    case "user_message_chunk": {
      if (turnHasAgentContent(state.rows, turnId) && turnHasUserRow(state.rows, turnId)) {
        const nextTurnId = nextReplayTurnId(turnId)
        return withLiveRunning({
          ...state,
          currentTurnId: nextTurnId,
          rows: [
            ...state.rows,
            {
              kind: "user",
              turnId: nextTurnId,
              text: parsed.text,
            },
          ],
        })
      }

      if (turnHasUserRow(state.rows, turnId)) {
        return withLiveRunning({
          ...state,
          rows: updateLastMatching(state.rows, isUserForTurn(turnId), (row) => ({
            ...row,
            text: `${row.text}${parsed.text}`,
          })),
        })
      }

      return withLiveRunning({
        ...state,
        rows: [
          ...state.rows,
          {
            kind: "user",
            turnId,
            text: parsed.text,
          },
        ],
      })
    }
    case "agent_thought_chunk": {
      const existing = state.rows.findLast(isThinkingForTurn(turnId))
      if (existing === undefined) {
        return withLiveRunning({
          ...state,
          rows: [
            ...state.rows,
            {
              kind: "thinking",
              turnId,
              text: parsed.text,
            },
          ],
        })
      }

      return withLiveRunning({
        ...state,
        rows: updateLastMatching(state.rows, isThinkingForTurn(turnId), (row) => ({
          ...row,
          text: `${row.text}${parsed.text}`,
        })),
      })
    }
    case "agent_message_chunk": {
      const existing = state.rows.findLast(isAssistantForTurn(turnId))
      if (existing === undefined) {
        return withLiveRunning({
          ...state,
          rows: [
            ...state.rows,
            {
              kind: "assistant",
              turnId,
              text: parsed.text,
            },
          ],
        })
      }

      return withLiveRunning({
        ...state,
        rows: updateLastMatching(state.rows, isAssistantForTurn(turnId), (row) => ({
          ...row,
          text: `${row.text}${parsed.text}`,
        })),
      })
    }
    case "tool_call":
      return withLiveRunning({
        ...state,
        rows: [
          ...state.rows,
          {
            kind: "tool",
            turnId,
            toolCallId: parsed.toolCallId,
            toolName: parsed.toolName,
            toolKind: parsed.toolKind,
            status: parsed.status,
            ...(parsed.detail === undefined ? {} : { detail: parsed.detail }),
          },
        ],
      })
    case "tool_call_update": {
      const existing = state.rows.findLast(isToolForCall(parsed.toolCallId))
      if (existing === undefined) {
        if (parsed.toolName === undefined) {
          return state
        }

        return withLiveRunning({
          ...state,
          rows: [
            ...state.rows,
            {
              kind: "tool",
              turnId,
              toolCallId: parsed.toolCallId,
              toolName: parsed.toolName,
              toolKind: parsed.toolKind ?? "execute",
              status: parsed.status,
              ...(parsed.detail === undefined ? {} : { detail: parsed.detail }),
            },
          ],
        })
      }

      return withLiveRunning({
        ...state,
        rows: updateLastMatching(state.rows, isToolForCall(parsed.toolCallId), (row) => ({
          ...row,
          ...(parsed.toolName === undefined ? {} : { toolName: parsed.toolName }),
          ...(parsed.toolKind === undefined ? {} : { toolKind: parsed.toolKind }),
          ...(parsed.detail === undefined ? {} : { detail: parsed.detail }),
          status: parsed.status,
        })),
      })
    }
  }
}

export const applyPromptComplete = (state: AcpTranscriptState): AcpTranscriptState => ({
  ...state,
  sessionState: "idle",
})

export const applyCancelled = (state: AcpTranscriptState): AcpTranscriptState => ({
  ...state,
  sessionState: "idle",
})

export const applyPermissionRequested = (
  state: AcpTranscriptState,
): AcpTranscriptState => ({
  ...state,
  sessionState: "awaiting-permission",
})

export const applyPermissionResolved = (
  state: AcpTranscriptState,
): AcpTranscriptState => ({
  ...state,
  sessionState: "running",
})

export const applyStreamError = (state: AcpTranscriptState): AcpTranscriptState => ({
  ...state,
  sessionState: "error",
})

export const applyReconnect = (): AcpTranscriptState => ({
  rows: [],
  sessionState: "offline",
  currentTurnId: "replay",
  live: false,
})

export const applySubscribed = (state: AcpTranscriptState): AcpTranscriptState => ({
  ...state,
  live: true,
  sessionState:
    state.sessionState === "running" || state.sessionState === "awaiting-permission"
      ? state.sessionState
      : "idle",
})
