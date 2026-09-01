import { ToolCallStatus, ToolKind } from "contracts/events/primitives"

export type TranscriptAttachmentPreview = {
  kind: "image" | "file"
  name: string
  size: number
  previewUrl?: string
}

export type TranscriptUserRow = {
  kind: "user"
  turnId: string
  text: string
  attachments?: ReadonlyArray<TranscriptAttachmentPreview>
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
