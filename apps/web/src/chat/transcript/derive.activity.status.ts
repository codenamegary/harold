import { shortToolLabel } from "./short.tool.label"
import { TranscriptRow, TranscriptToolRow } from "./rows"

export type ActivityPhase =
  | "waiting-for-permission"
  | "using-tools"
  | "replying"
  | "thinking"
  | "working"

export type ActivityStatus = {
  phase: ActivityPhase
  label: string
  subtitle?: string
}

type DeriveActivityStatusInput = {
  rows: ReadonlyArray<TranscriptRow>
  isRunning: boolean
  hasPendingPermission: boolean
}

const isActiveToolStatus = (status: TranscriptToolRow["status"]): boolean =>
  status === "pending" || status === "in_progress"

const latestTurnId = (rows: ReadonlyArray<TranscriptRow>): string | null => {
  const last = rows.findLast((row) => row.kind === "user")
  return last?.turnId ?? null
}

const toolsForTurn = (
  rows: ReadonlyArray<TranscriptRow>,
  turnId: string,
): ReadonlyArray<TranscriptToolRow> =>
  rows.filter(
    (row): row is TranscriptToolRow =>
      row.kind === "tool" && row.turnId === turnId,
  )

const turnHasAssistant = (
  rows: ReadonlyArray<TranscriptRow>,
  turnId: string,
): boolean => rows.some((row) => row.kind === "assistant" && row.turnId === turnId)

export const deriveActivityStatus = ({
  rows,
  isRunning,
  hasPendingPermission,
}: DeriveActivityStatusInput): ActivityStatus | null => {
  if (!isRunning) {
    return null
  }

  if (hasPendingPermission) {
    return {
      phase: "waiting-for-permission",
      label: "Waiting for permission",
    }
  }

  const turnId = latestTurnId(rows)
  if (turnId === null) {
    return {
      phase: "thinking",
      label: "Thinking",
    }
  }

  const activeTool = toolsForTurn(rows, turnId).findLast((tool) =>
    isActiveToolStatus(tool.status),
  )
  if (activeTool !== undefined) {
    const toolLabel = shortToolLabel(activeTool).trim()
    return {
      phase: "using-tools",
      label: toolLabel.length > 0 ? toolLabel : "Using tools",
    }
  }

  if (turnHasAssistant(rows, turnId)) {
    return {
      phase: "replying",
      label: "Replying",
    }
  }

  const hadTools = toolsForTurn(rows, turnId).length > 0
  if (hadTools) {
    return {
      phase: "working",
      label: "Working",
    }
  }

  return {
    phase: "thinking",
    label: "Thinking",
  }
}
