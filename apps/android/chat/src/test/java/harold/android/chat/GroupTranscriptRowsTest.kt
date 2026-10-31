package harold.android.chat

import harold.android.contracts.ToolCallStatus
import harold.android.contracts.ToolKind
import harold.android.live.TranscriptAssistantRow
import harold.android.live.TranscriptThinkingRow
import harold.android.live.TranscriptToolRow
import harold.android.live.TranscriptUserRow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GroupTranscriptRowsTest {
    @Test
    fun groupsConsecutiveToolRowsIntoOneRun() {
        val rows = listOf(
            user("turn_1"),
            tool("t1"),
            tool("t2"),
            TranscriptAssistantRow(turnId = "turn_1", text = "done"),
        )

        val blocks = groupTranscriptRows(rows)

        assertEquals(3, blocks.size)
        assertTrue(blocks[0] is TranscriptBlock.TurnHeader)
        assertTrue(blocks[1] is TranscriptBlock.ToolRun)
        assertTrue(blocks[2] is TranscriptBlock.Row)
        val run = blocks[1] as TranscriptBlock.ToolRun
        assertEquals(listOf("t1", "t2"), run.tools.map { it.toolCallId })
    }

    @Test
    fun startsANewToolRunAtTextThinkingAndTurnBoundaries() {
        val rows = listOf(
            user("turn_1"),
            tool("t1"),
            TranscriptAssistantRow(turnId = "turn_1", text = "between"),
            tool("t2"),
            TranscriptThinkingRow(turnId = "turn_1", text = "thinking"),
            tool("t3"),
            user("turn_2"),
            tool("t4"),
        )

        val blocks = groupTranscriptRows(rows)

        assertEquals(
            listOf(
                "TurnHeader",
                "ToolRun",
                "Row",
                "ToolRun",
                "Row",
                "ToolRun",
                "TurnHeader",
                "ToolRun",
            ),
            blocks.map { it::class.simpleName },
        )
        assertEquals(
            listOf("t1", "t2", "t3", "t4"),
            blocks.filterIsInstance<TranscriptBlock.ToolRun>().map { run ->
                run.tools.single().toolCallId
            },
        )
    }

    @Test
    fun hidesAQuestionToolThatAlreadyHasAResolvedQuestionRow() {
        val rows = listOf(
            user("turn_1"),
            tool("t1"),
            harold.android.live.TranscriptQuestionRow(
                turnId = "turn_1",
                requestId = "req-1",
                title = "Choose",
                answers = listOf("Choice" to "Yes"),
                toolCallId = "t1",
            ),
            TranscriptAssistantRow(turnId = "turn_1", text = "done"),
        )

        val blocks = groupTranscriptRows(rows)

        assertEquals(
            listOf("TurnHeader", "Row", "Row"),
            blocks.map { it::class.simpleName },
        )
        assertTrue(blocks.none { it is TranscriptBlock.ToolRun })
    }

    @Test
    fun keepsFailedToolsOutOfTheCompletedFold() {
        val rows = listOf(
            user("turn_1"),
            tool("t1"),
            tool("t2", status = ToolCallStatus.Failed),
            tool("t3"),
        )

        val run = groupTranscriptRows(rows).filterIsInstance<TranscriptBlock.ToolRun>().single()

        assertEquals(listOf("t1", "t3"), run.completed.map { it.toolCallId })
        assertEquals(listOf("t2"), run.visible.map { it.toolCallId })
        assertTrue(run.tools[1].status == ToolCallStatus.Failed)
    }

    @Test
    fun keepsActiveToolsVisible() {
        val rows = listOf(
            user("turn_1"),
            tool("t1"),
            tool("t2", status = ToolCallStatus.InProgress),
        )

        val run = groupTranscriptRows(rows).filterIsInstance<TranscriptBlock.ToolRun>().single()

        assertEquals(listOf("t1"), run.completed.map { it.toolCallId })
        assertEquals(listOf("t2"), run.visible.map { it.toolCallId })
    }

    private fun user(turnId: String): TranscriptUserRow =
        TranscriptUserRow(turnId = turnId, text = "go")

    private fun tool(
        toolCallId: String,
        status: ToolCallStatus = ToolCallStatus.Completed,
    ): TranscriptToolRow = TranscriptToolRow(
        turnId = "turn_1",
        toolCallId = toolCallId,
        toolName = "read",
        toolKind = ToolKind.Read,
        status = status,
    )
}
