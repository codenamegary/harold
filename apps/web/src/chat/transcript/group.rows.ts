import { TranscriptRow, TranscriptToolRow } from "./rows"

export type TranscriptDisplayRow = Exclude<TranscriptRow, TranscriptToolRow>

export type TranscriptBlock =
  | { kind: "row"; row: TranscriptDisplayRow; index: number }
  | { kind: "tools"; tools: ReadonlyArray<TranscriptToolRow>; startIndex: number }

export const groupTranscriptRows = (
  rows: ReadonlyArray<TranscriptRow>,
): ReadonlyArray<TranscriptBlock> => {
  const blocks: TranscriptBlock[] = []
  let index = 0

  while (index < rows.length) {
    const row = rows[index]
    if (row === undefined) {
      break
    }

    if (row.kind !== "tool") {
      blocks.push({ kind: "row", row, index })
      index += 1
      continue
    }

    const tools: TranscriptToolRow[] = []
    const startIndex = index
    while (index < rows.length) {
      const candidate = rows[index]
      if (candidate === undefined || candidate.kind !== "tool") {
        break
      }
      tools.push(candidate)
      index += 1
    }
    blocks.push({ kind: "tools", tools, startIndex })
  }

  return blocks
}
