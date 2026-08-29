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
