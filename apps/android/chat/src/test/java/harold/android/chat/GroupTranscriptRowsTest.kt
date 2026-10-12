package harold.android.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import harold.android.contracts.ToolCallStatus
import harold.android.contracts.ToolKind

class GroupTranscriptRowsTest {
    @Test
    fun collapsesConsecutiveToolRowsIntoOneBlock() {
        val rows = listOf(
            TranscriptUserRow(turnId = "turn_1", text = "go"),
            TranscriptToolRow(
                turnId = "turn_1",
                toolCallId = "t1",
                toolName = "read",
                toolKind = ToolKind.Read,
                status = ToolCallStatus.Completed,
            ),
            TranscriptToolRow(
                turnId = "turn_1",
                toolCallId = "t2",
                toolName = "grep",
                toolKind = ToolKind.Execute,
                status = ToolCallStatus.Completed,
            ),
            TranscriptAssistantRow(turnId = "turn_1", text = "done"),
        )

        val blocks = groupTranscriptRows(rows)

        assertEquals(3, blocks.size)
        assertTrue(blocks[0] is TranscriptBlock.Row)
        assertTrue(blocks[1] is TranscriptBlock.Tools)
        assertTrue(blocks[2] is TranscriptBlock.Row)
        val tools = blocks[1] as TranscriptBlock.Tools
        assertEquals(2, tools.tools.size)
    }
}
