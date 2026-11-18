package harold.android.chat

import harold.android.contracts.ToolCallStatus
import harold.android.live.TranscriptQuestionRow
import harold.android.live.TranscriptRow
import harold.android.live.TranscriptThinkingRow
import harold.android.live.TranscriptToolRow
import harold.android.live.TranscriptUserRow

sealed interface TranscriptBlock {
    data class TurnHeader(
        val row: TranscriptUserRow,
        val index: Int,
    ) : TranscriptBlock

    data class Row(
        val row: TranscriptRow,
        val index: Int,
    ) : TranscriptBlock

    data class ActivityRun(
        val rows: List<TranscriptRow>,
        val startIndex: Int,
    ) : TranscriptBlock {
        val thinking: List<TranscriptThinkingRow> =
            rows.filterIsInstance<TranscriptThinkingRow>()

        val tools: List<TranscriptToolRow> =
            rows.filterIsInstance<TranscriptToolRow>()

        val failedCount: Int =
            tools.count { tool -> tool.status == ToolCallStatus.Failed }

        val hasFailure: Boolean = failedCount > 0
    }
}

fun groupTranscriptRows(rows: List<TranscriptRow>): List<TranscriptBlock> {
    val blocks = mutableListOf<TranscriptBlock>()
    val questionToolCallIds = rows
        .filterIsInstance<TranscriptQuestionRow>()
        .mapNotNull { row -> row.toolCallId }
        .toSet()
    var index = 0

    while (index < rows.size) {
        val row = rows[index]
        if (row is TranscriptUserRow) {
            blocks.add(TranscriptBlock.TurnHeader(row = row, index = index))
            index += 1
            continue
        }

        if (row is TranscriptToolRow && row.toolCallId in questionToolCallIds) {
            index += 1
            continue
        }

        if (row !is TranscriptThinkingRow && row !is TranscriptToolRow) {
            blocks.add(TranscriptBlock.Row(row = row, index = index))
            index += 1
            continue
        }

        val activity = mutableListOf<TranscriptRow>()
        val startIndex = index
        while (index < rows.size) {
            val candidate = rows[index]
            if (candidate.turnId != row.turnId) {
                break
            }
            if (candidate is TranscriptToolRow && candidate.toolCallId in questionToolCallIds) {
                break
            }
            if (candidate !is TranscriptThinkingRow && candidate !is TranscriptToolRow) {
                break
            }
            activity.add(candidate)
            index += 1
        }
        blocks.add(TranscriptBlock.ActivityRun(rows = activity, startIndex = startIndex))
    }

    return blocks
}

/** The run containing the live tail, or -1 when the agent is not inside an activity run. */
internal fun activeActivityStartIndex(
    blocks: List<TranscriptBlock>,
    rows: List<TranscriptRow>,
    isRunning: Boolean,
): Int {
    if (!isRunning) {
        return -1
    }

    val lastIndex = rows.lastIndex
    if (lastIndex < 0) {
        return -1
    }
    val last = rows[lastIndex]
    if (last !is TranscriptThinkingRow && last !is TranscriptToolRow) {
        return -1
    }

    blocks.forEach { block ->
        if (
            block is TranscriptBlock.ActivityRun &&
            lastIndex >= block.startIndex &&
            lastIndex < block.startIndex + block.rows.size
        ) {
            return block.startIndex
        }
    }
    return -1
}
