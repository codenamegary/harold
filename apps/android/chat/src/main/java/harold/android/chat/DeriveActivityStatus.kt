package harold.android.chat

import harold.android.live.TranscriptAssistantRow
import harold.android.live.TranscriptRow
import harold.android.live.TranscriptToolRow
import harold.android.live.TranscriptUserRow

enum class ActivityPhase {
    WaitingForPermission,
    WaitingForAnswer,
    UsingTools,
    Replying,
    Thinking,
    Working,
}

data class ActivityStatus(
    val phase: ActivityPhase,
    val label: String,
    val subtitle: String? = null,
)

fun deriveActivityStatus(
    rows: List<TranscriptRow>,
    isRunning: Boolean,
    hasPendingPermission: Boolean,
    hasPendingQuestion: Boolean = false,
): ActivityStatus? {
    if (!isRunning) {
        return null
    }

    if (hasPendingPermission && hasPendingQuestion) {
        return ActivityStatus(
            phase = ActivityPhase.WaitingForAnswer,
            label = "Waiting for you",
        )
    }

    if (hasPendingPermission) {
        return ActivityStatus(
            phase = ActivityPhase.WaitingForPermission,
            label = "Waiting for permission",
        )
    }

    if (hasPendingQuestion) {
        return ActivityStatus(
            phase = ActivityPhase.WaitingForAnswer,
            label = "Waiting for answer",
        )
    }

    val turnId = latestTurnId(rows)
    if (turnId == null) {
        return ActivityStatus(
            phase = ActivityPhase.Thinking,
            label = "Thinking",
        )
    }

    val activeTool = toolsForTurn(rows, turnId).findLast { tool ->
        isActiveToolStatus(tool.status)
    }
    if (activeTool != null) {
        // The live tool row already names the running call.
        return null
    }

    if (turnHasAssistant(rows, turnId)) {
        return ActivityStatus(
            phase = ActivityPhase.Replying,
            label = "Replying",
        )
    }

    if (toolsForTurn(rows, turnId).isNotEmpty()) {
        // Completed tools fold into their own row; no extra status text is needed.
        return null
    }

    return ActivityStatus(
        phase = ActivityPhase.Thinking,
        label = "Thinking",
    )
}

private fun latestTurnId(rows: List<TranscriptRow>): String? =
    rows.lastOrNull { it is TranscriptUserRow }?.turnId

private fun toolsForTurn(
    rows: List<TranscriptRow>,
    turnId: String,
): List<TranscriptToolRow> =
    rows.filterIsInstance<TranscriptToolRow>().filter { it.turnId == turnId }

private fun turnHasAssistant(rows: List<TranscriptRow>, turnId: String): Boolean =
    rows.any { it is TranscriptAssistantRow && it.turnId == turnId }
