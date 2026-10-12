package harold.android.chat

import harold.android.contracts.ToolCallStatus
import harold.android.contracts.ToolKind
import harold.android.live.TranscriptAssistantRow
import harold.android.live.TranscriptThinkingRow
import harold.android.live.TranscriptToolRow
import harold.android.live.TranscriptUserRow
import org.junit.Assert.assertEquals
import org.junit.Test

class LiveAssistantRowIndexTest {
    @Test
    fun idleTurnsDoNotStream() {
        val rows = listOf(
            TranscriptUserRow(turnId = "turn_1", text = "go"),
            TranscriptAssistantRow(turnId = "turn_1", text = "Added."),
        )

        assertEquals(-1, liveAssistantRowIndex(rows = rows, isRunning = false))
    }

    @Test
    fun streamsTheCurrentTurnAssistantWhileRunning() {
        val rows = listOf(
            TranscriptUserRow(turnId = "replay", text = "first"),
            TranscriptAssistantRow(turnId = "replay", text = "old reply"),
            TranscriptUserRow(turnId = "replay-2", text = "follow up"),
            TranscriptThinkingRow(turnId = "replay-2", text = "planning"),
            TranscriptAssistantRow(turnId = "replay-2", text = "Add"),
        )

        assertEquals(4, liveAssistantRowIndex(rows = rows, isRunning = true))
    }

    @Test
    fun keepsStreamingTheCurrentAssistantAfterLaterTools() {
        val rows = listOf(
            TranscriptUserRow(turnId = "turn_1", text = "go"),
            TranscriptAssistantRow(turnId = "turn_1", text = "Added."),
            TranscriptToolRow(
                turnId = "turn_1",
                toolCallId = "t1",
                toolName = "read",
                toolKind = ToolKind.Read,
                status = ToolCallStatus.Completed,
            ),
        )

        assertEquals(1, liveAssistantRowIndex(rows = rows, isRunning = true))
    }

    @Test
    fun doesNotStreamUntilTheCurrentTurnHasAnAssistantRow() {
        val rows = listOf(
            TranscriptUserRow(turnId = "replay", text = "first"),
            TranscriptAssistantRow(turnId = "replay", text = "old reply"),
            TranscriptUserRow(turnId = "replay-2", text = "follow up"),
            TranscriptThinkingRow(turnId = "replay-2", text = "planning"),
        )

        assertEquals(-1, liveAssistantRowIndex(rows = rows, isRunning = true))
    }
}
