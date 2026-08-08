package server.agent.android.chat

enum class ActivityPhase {
    WaitingForPermission,
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
): ActivityStatus? {
    if (!isRunning) {
        return null
    }

    if (hasPendingPermission) {
        return ActivityStatus(
            phase = ActivityPhase.WaitingForPermission,
            label = "Waiting for permission",
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
        val toolLabel = shortToolLabel(activeTool).trim()
        return ActivityStatus(
            phase = ActivityPhase.UsingTools,
            label = toolLabel.ifEmpty { "Using tools" },
        )
    }

    if (turnHasAssistant(rows, turnId)) {
        return ActivityStatus(
            phase = ActivityPhase.Replying,
            label = "Replying",
        )
    }

    if (toolsForTurn(rows, turnId).isNotEmpty()) {
        return ActivityStatus(
            phase = ActivityPhase.Working,
            label = "Working",
        )
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
