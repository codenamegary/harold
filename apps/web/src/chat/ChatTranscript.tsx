import React from "react"
import { MarkdownMessage } from "./MarkdownMessage"
import { TranscriptRow } from "./transcript.reducer"

type ChatTranscriptProps = {
  rows: ReadonlyArray<TranscriptRow>
}

const rowKey = (row: TranscriptRow, index: number): string => {
  switch (row.kind) {
    case "user":
    case "thinking":
    case "assistant":
      return `${row.kind}-${row.turnId}-${index}`
    case "tool":
      return `${row.kind}-${row.toolCallId}`
  }
}

export const ChatTranscript: React.FC<ChatTranscriptProps> = ({ rows }) => {
  if (rows.length === 0) {
    return null
  }

  return (
    <div
      className="mx-auto flex w-full max-w-[800px] flex-col gap-3"
      aria-label="Chat transcript"
      role="region"
    >
      {rows.map((row, index) => {
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
          return (
            <div
              key={rowKey(row, index)}
              className="px-1 font-mono text-2xs text-dim"
            >
              {row.text}
            </div>
          )
        }

        if (row.kind === "tool") {
          return (
            <div
              key={rowKey(row, index)}
              className="rounded-md border border-line-soft bg-[#0d1117] px-3 py-2 font-mono text-2xs text-[#8b949e]"
            >
              {row.toolName} · {row.status}
            </div>
          )
        }

        return (
          <div key={rowKey(row, index)} className="px-1">
            <MarkdownMessage text={row.text} />
          </div>
        )
      })}
    </div>
  )
}
