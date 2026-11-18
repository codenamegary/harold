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
    fun groupsConsecutiveThinkingAndToolsIntoOneActivityRun() {
        val rows = listOf(
            user("turn_1"),
            TranscriptThinkingRow(turnId = "turn_1", text = "plan"),
            tool("t1"),
            tool("t2"),
            TranscriptAssistantRow(turnId = "turn_1", text = "done"),
        )

        val blocks = groupTranscriptRows(rows)

        assertEquals(3, blocks.size)
        assertTrue(blocks[0] is TranscriptBlock.TurnHeader)
        assertTrue(blocks[1] is TranscriptBlock.ActivityRun)
        assertTrue(blocks[2] is TranscriptBlock.Row)
        val run = blocks[1] as TranscriptBlock.ActivityRun
        assertEquals(listOf("t1", "t2"), run.tools.map { it.toolCallId })
        assertEquals(listOf("plan"), run.thinking.map { it.text })
    }

    @Test
    fun startsANewActivityRunAtAssistantAndTurnBoundaries() {
        val rows = listOf(
            user("turn_1"),
            tool("t1"),
            TranscriptAssistantRow(turnId = "turn_1", text = "between"),
            tool("t2"),
            TranscriptThinkingRow(turnId = "turn_1", text = "thinking"),
            tool("t3"),
            user("turn_2"),
            tool("t4", turnId = "turn_2"),
        )

        val blocks = groupTranscriptRows(rows)

        assertEquals(
            listOf(
                "TurnHeader",
                "ActivityRun",
                "Row",
                "ActivityRun",
                "TurnHeader",
                "ActivityRun",
            ),
            blocks.map { it::class.simpleName },
        )
        assertEquals(
            listOf(listOf("t1"), listOf("t2", "t3"), listOf("t4")),
            blocks.filterIsInstance<TranscriptBlock.ActivityRun>().map { run ->
                run.tools.map { tool -> tool.toolCallId }
            },
        )
    }

    @Test
    fun keepsInterleavedActivityInOriginalOrder() {
        val rows = listOf(
            user("turn_1"),
            TranscriptThinkingRow(turnId = "turn_1", text = "one"),
            tool("t1"),
            TranscriptThinkingRow(turnId = "turn_1", text = "two"),
            tool("t2"),
        )

        val run = groupTranscriptRows(rows).filterIsInstance<TranscriptBlock.ActivityRun>().single()

        assertEquals(
            listOf(
                "TranscriptThinkingRow",
                "TranscriptToolRow",
                "TranscriptThinkingRow",
                "TranscriptToolRow",
            ),
            run.rows.map { row -> row::class.simpleName },
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
        assertTrue(blocks.none { it is TranscriptBlock.ActivityRun })
    }

    @Test
    fun countsFailedAndActiveToolsInTheRun() {
        val rows = listOf(
            user("turn_1"),
            tool("t1"),
            tool("t2", status = ToolCallStatus.Failed),
            tool("t3", status = ToolCallStatus.InProgress),
        )

        val run = groupTranscriptRows(rows).filterIsInstance<TranscriptBlock.ActivityRun>().single()

        assertEquals(1, run.failedCount)
        assertEquals(
            listOf(ToolCallStatus.Completed, ToolCallStatus.Failed, ToolCallStatus.InProgress),
            run.tools.map { tool -> tool.status },
        )
    }

    @Test
    fun labelsActivityRunsByShapeAndState() {
        val thinking = groupTranscriptRows(
            listOf(
                user("turn_1"),
                TranscriptThinkingRow(turnId = "turn_1", text = "plan"),
            ),
        ).filterIsInstance<TranscriptBlock.ActivityRun>().single()
        assertEquals("Thinking...", activitySummary(run = thinking, active = true))
        assertEquals("Thinking", activitySummary(run = thinking, active = false))

        val tools = groupTranscriptRows(
            listOf(
                user("turn_1"),
                tool("t1", status = ToolCallStatus.InProgress),
                tool("t2"),
            ),
        ).filterIsInstance<TranscriptBlock.ActivityRun>().single()
        assertEquals("Using tools", activitySummary(run = tools, active = true))
        assertEquals("2 tools", activitySummary(run = tools, active = false))

        val mixed = groupTranscriptRows(
            listOf(
                user("turn_1"),
                TranscriptThinkingRow(turnId = "turn_1", text = "plan"),
                tool("t1"),
                tool("t2"),
            ),
        ).filterIsInstance<TranscriptBlock.ActivityRun>().single()
        assertEquals("Thought, 2 tools", activitySummary(run = mixed, active = false))
    }

    @Test
    fun findsTheActiveActivityRunAtTheTail() {
        val rows = listOf(
            user("turn_1"),
            TranscriptThinkingRow(turnId = "turn_1", text = "plan"),
            tool("t1", status = ToolCallStatus.InProgress),
        )

        val blocks = groupTranscriptRows(rows)

        assertEquals(1, activeActivityStartIndex(blocks = blocks, rows = rows, isRunning = true))
        assertEquals(-1, activeActivityStartIndex(blocks = blocks, rows = rows, isRunning = false))
    }

    @Test
    fun keepsNoRunActiveOnceTheAssistantReplies() {
        val rows = listOf(
            user("turn_1"),
            TranscriptThinkingRow(turnId = "turn_1", text = "plan"),
            tool("t1"),
            TranscriptAssistantRow(turnId = "turn_1", text = "done"),
        )

        val blocks = groupTranscriptRows(rows)

        assertEquals(-1, activeActivityStartIndex(blocks = blocks, rows = rows, isRunning = true))
    }

    private fun user(turnId: String): TranscriptUserRow =
        TranscriptUserRow(turnId = turnId, text = "go")

    private fun tool(
        toolCallId: String,
        turnId: String = "turn_1",
        status: ToolCallStatus = ToolCallStatus.Completed,
    ): TranscriptToolRow = TranscriptToolRow(
        turnId = turnId,
        toolCallId = toolCallId,
        toolName = "read",
        toolKind = ToolKind.Read,
        status = status,
    )
}
