import { TranscriptToolRow } from "./rows"

const truncateLabel = (value: string, maxChars: number): string =>
  value.length <= maxChars ? value : `${value.slice(0, maxChars - 1)}…`

export const shortToolLabel = (tool: TranscriptToolRow): string => {
  const name = tool.toolName.trim()
  if (name.startsWith("`")) {
    const firstLine = (name.replace(/^`+/, "").split("\n")[0] ?? name).trim()
    return truncateLabel(firstLine, 72)
  }

  const detailLine = tool.detail?.split("\n")[0]?.trim()
  if (detailLine !== undefined && detailLine.length > 0) {
    return `${name} · ${truncateLabel(detailLine, 56)}`
  }

  return name
}
