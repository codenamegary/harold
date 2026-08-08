package server.agent.android.chat

sealed interface TranscriptBlock {
    data class Row(
        val row: TranscriptRow,
        val index: Int,
    ) : TranscriptBlock

    data class Tools(
        val tools: List<TranscriptToolRow>,
        val startIndex: Int,
    ) : TranscriptBlock
}

fun groupTranscriptRows(rows: List<TranscriptRow>): List<TranscriptBlock> {
    val blocks = mutableListOf<TranscriptBlock>()
    var index = 0

    while (index < rows.size) {
        val row = rows[index]
        if (row !is TranscriptToolRow) {
            blocks.add(TranscriptBlock.Row(row = row, index = index))
            index += 1
            continue
        }

        val tools = mutableListOf<TranscriptToolRow>()
        val startIndex = index
        while (index < rows.size) {
            val candidate = rows[index]
            if (candidate !is TranscriptToolRow) {
                break
            }
            tools.add(candidate)
            index += 1
        }
        blocks.add(TranscriptBlock.Tools(tools = tools, startIndex = startIndex))
    }

    return blocks
}
