import React from "react"
import { ActivityStatusLine } from "./ActivityStatusLine"
import { deriveActivityStatus } from "./derive.activity.status"
import { groupTranscriptRows } from "./group.rows"
import { MarkdownMessage } from "./MarkdownMessage"
import { ThinkingSection } from "./ThinkingSection"
import { ToolCallGroup } from "./ToolCallGroup"
import { TranscriptRow } from "./rows"

type ChatTranscriptProps = {
  rows: ReadonlyArray<TranscriptRow>
  isRunning?: boolean
  hasPendingPermission?: boolean
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

export const ChatTranscript: React.FC<ChatTranscriptProps> = ({
  rows,
  isRunning = false,
  hasPendingPermission = false,
}) => {
  if (rows.length === 0 && !isRunning) {
    return null
  }

  const activity = deriveActivityStatus({
    rows,
    isRunning,
    hasPendingPermission,
  })
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
              {row.attachments !== undefined && row.attachments.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {row.attachments.map((attachment, attachmentIndex) =>
                    attachment.kind === "image" && attachment.previewUrl !== undefined ? (
                      <img
                        key={`${row.turnId}-${attachmentIndex}`}
                        src={attachment.previewUrl}
                        alt={attachment.name}
                        className="size-16 rounded-md border border-line object-cover"
                      />
                    ) : (
                      <span
                        key={`${row.turnId}-${attachmentIndex}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-[#181d25] px-2 py-1 font-mono text-2xs text-body-soft"
                      >
                        {attachment.name}
                      </span>
                    ),
                  )}
                </div>
              ) : null}
            </div>
          )
        }

        if (row.kind === "thinking") {
          return <ThinkingSection key={rowKey(row, index)} text={row.text} />
        }

        return (
          <div key={rowKey(row, index)} className="px-1">
            <MarkdownMessage text={row.text} />
          </div>
        )
      })}
      {activity !== null ? (
        <ActivityStatusLine
          label={activity.label}
          subtitle={activity.subtitle}
        />
      ) : null}
    </div>
  )
}
