package harold.android.chat

import harold.android.contracts.ToolCallStatus
import harold.android.live.TranscriptRow
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

    data class ToolRun(
        val tools: List<TranscriptToolRow>,
        val startIndex: Int,
    ) : TranscriptBlock {
        /** Completed calls fold into one summary row. Failed and active calls stay visible. */
        val completed: List<TranscriptToolRow> =
            tools.filter { tool -> tool.status == ToolCallStatus.Completed }

        val visible: List<TranscriptToolRow> =
            tools.filter { tool -> tool.status != ToolCallStatus.Completed }
    }
}

fun groupTranscriptRows(rows: List<TranscriptRow>): List<TranscriptBlock> {
    val blocks = mutableListOf<TranscriptBlock>()
    var index = 0

    while (index < rows.size) {
        val row = rows[index]
        if (row is TranscriptUserRow) {
            blocks.add(TranscriptBlock.TurnHeader(row = row, index = index))
            index += 1
            continue
        }

        if (row !is TranscriptToolRow) {
            blocks.add(TranscriptBlock.Row(row = row, index = index))
            index += 1
            continue
        }

        val tools = mutableListOf<TranscriptToolRow>()
        val startIndex = index
        while (index < rows.size) {
            val candidate = rows[index]
            if (candidate !is TranscriptToolRow || candidate.turnId != row.turnId) {
                break
            }
            tools.add(candidate)
            index += 1
        }
        blocks.add(TranscriptBlock.ToolRun(tools = tools, startIndex = startIndex))
    }

    return blocks
}
