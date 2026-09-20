import React from "react"
import { shortToolLabel } from "./short.tool.label"
import { TranscriptToolRow } from "./rows"

type ToolCallGroupProps = {
  tools: ReadonlyArray<TranscriptToolRow>
}

const toolCallLabel = (count: number): string =>
  count === 1 ? "1 tool call" : `${count} tool calls`

const isActiveStatus = (status: TranscriptToolRow["status"]): boolean =>
  status === "pending" || status === "in_progress"

const toolDetailBody = (tool: TranscriptToolRow): string => {
  const parts = [tool.toolName.trim()]
  if (tool.detail !== undefined && tool.detail.trim().length > 0) {
    parts.push(tool.detail.trim())
  }
  parts.push(`status: ${tool.status}`)
  return parts.join("\n\n")
}

export const ToolCallGroup: React.FC<ToolCallGroupProps> = ({ tools }) => {
  const activeCount = tools.filter((tool) => isActiveStatus(tool.status)).length
  const summary =
    activeCount > 0
      ? `${toolCallLabel(tools.length)} · ${activeCount} running`
      : toolCallLabel(tools.length)

  return (
    <details className="group/tool-group rounded-md border border-line-soft bg-panel open:bg-panel-2">
      <summary className="cursor-pointer list-none px-3 py-2 font-mono text-base text-muted marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <span
            aria-hidden
            className="text-base text-dim transition-transform group-open/tool-group:rotate-90"
          >
            ▸
          </span>
          <span>{summary}</span>
        </span>
      </summary>
      <ul className="m-0 flex list-none flex-col gap-1.5 border-t border-line-soft px-2 py-2">
        {tools.map((tool) => (
          <li key={tool.toolCallId}>
            <details className="group/tool-item rounded border border-line-soft/80 bg-surface-deep">
              <summary className="cursor-pointer list-none px-2.5 py-1.5 font-mono text-base text-muted marker:content-none [&::-webkit-details-marker]:hidden">
                <span className="inline-flex min-w-0 items-start gap-2">
                  <span
                    aria-hidden
                    className="shrink-0 text-base text-dim transition-transform group-open/tool-item:rotate-90"
                  >
                    ▸
                  </span>
                  <span className="min-w-0 whitespace-pre-wrap wrap-anywhere">
                    {shortToolLabel(tool)} · {tool.status}
                  </span>
                </span>
              </summary>
              <pre className="m-0 border-t border-line-soft px-2.5 py-2 font-mono text-base leading-relaxed whitespace-pre-wrap wrap-anywhere text-body-soft">
                {toolDetailBody(tool)}
              </pre>
            </details>
          </li>
        ))}
      </ul>
    </details>
  )
}
