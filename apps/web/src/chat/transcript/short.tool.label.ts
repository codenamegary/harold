import { TranscriptToolRow } from "./rows"

export const shortToolLabel = (tool: TranscriptToolRow): string => {
  const name = tool.toolName.trim()
  if (name.startsWith("`")) {
    return (name.replace(/^`+/, "").split("\n")[0] ?? name).trim()
  }

  const detailLine = tool.detail?.split("\n")[0]?.trim()
  if (detailLine !== undefined && detailLine.length > 0) {
    return `${name} · ${detailLine}`
  }

  return name
}
