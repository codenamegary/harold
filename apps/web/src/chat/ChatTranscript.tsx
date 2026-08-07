import React from "react"
import { groupTranscriptRows } from "./group.transcript.rows"
import { MarkdownMessage } from "./MarkdownMessage"
import { ThinkingIndicator } from "./ThinkingIndicator"
import { ThinkingSection } from "./ThinkingSection"
import { ToolCallGroup } from "./ToolCallGroup"
import { TranscriptRow } from "./transcript.reducer"

type ChatTranscriptProps = {
  rows: ReadonlyArray<TranscriptRow>
  isRunning?: boolean
}

const rowKey = (
  row: Exclude<TranscriptRow, { kind: "tool" }>,
  index: number,
): string => {
  switch (row.kind) {
    case "user":
    case "thinking":
    case "assistant":
      return `${row.kind}-${row.turnId}-${index}`
  }
}

const latestTurnId = (rows: ReadonlyArray<TranscriptRow>): string | null => {
  const last = rows.findLast((row) => row.kind === "user")
  return last?.turnId ?? null
}

const turnHasAssistant = (
  rows: ReadonlyArray<TranscriptRow>,
  turnId: string,
): boolean => rows.some((row) => row.kind === "assistant" && row.turnId === turnId)

export const ChatTranscript: React.FC<ChatTranscriptProps> = ({
  rows,
  isRunning = false,
}) => {
  if (rows.length === 0 && !isRunning) {
    return null
  }

  const activeTurnId = latestTurnId(rows)
  const showWaitingIndicator =
    isRunning
    && (rows.length === 0
      || (activeTurnId !== null && !turnHasAssistant(rows, activeTurnId)))
  const blocks = groupTranscriptRows(rows)

  return (
    <div
      className="mx-auto flex w-full max-w-[800px] flex-col gap-3"
      aria-label="Chat transcript"
      role="region"
    >
      {blocks.map((block) => {
        if (block.kind === "tools") {
          return (
            <ToolCallGroup
              key={`tools-${block.startIndex}-${block.tools[0]?.toolCallId ?? "empty"}`}
              tools={block.tools}
            />
          )
        }

        const { row, index } = block

        if (row.kind === "user") {
          return (
            <div
              key={rowKey(row, index)}
              className="rounded-lg border border-line bg-[#12161b] px-3.5 py-3 text-sm text-body"
            >
              {row.text}
            </div>
          )
        }

        if (row.kind === "thinking") {
          const isActiveThought =
            isRunning
            && activeTurnId === row.turnId
            && !turnHasAssistant(rows, row.turnId)
            && rows.findLastIndex((candidate) => candidate.kind === "thinking") === index

          return (
            <ThinkingSection
              key={rowKey(row, index)}
              text={row.text}
              isActive={isActiveThought}
            />
          )
        }

        return (
          <div key={rowKey(row, index)} className="px-1">
            <MarkdownMessage text={row.text} />
          </div>
        )
      })}
      {showWaitingIndicator
        && rows.findLast((row) => row.kind === "thinking") === undefined ? (
        <ThinkingIndicator />
      ) : null}
    </div>
  )
}
