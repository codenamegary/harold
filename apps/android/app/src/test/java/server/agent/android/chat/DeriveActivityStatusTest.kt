package server.agent.android.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import server.agent.android.contracts.ToolCallStatus
import server.agent.android.contracts.ToolKind

class DeriveActivityStatusTest {
    @Test
    fun returnsNullWhenNotRunning() {
        assertNull(
            deriveActivityStatus(
                rows = listOf(user()),
                isRunning = false,
                hasPendingPermission = false,
            ),
        )
    }

    @Test
    fun returnsWaitingForPermissionOverTools() {
        val rows = listOf(
            user(),
            tool(toolCallId = "t1", toolName = "read", status = ToolCallStatus.Pending),
        )

        assertEquals(
            ActivityStatus(
                phase = ActivityPhase.WaitingForPermission,
                label = "Waiting for permission",
            ),
            deriveActivityStatus(
                rows = rows,
                isRunning = true,
                hasPendingPermission = true,
            ),
        )
    }

    @Test
    fun returnsUsingToolsAsSinglePrimaryLabel() {
        val rows = listOf(
            user(),
            tool(
                toolCallId = "t1",
                toolName = "Read File",
                status = ToolCallStatus.Completed,
                detail = "/tmp/a.ts",
            ),
            tool(
                toolCallId = "t2",
                toolName = "grep",
                toolKind = ToolKind.Execute,
                status = ToolCallStatus.InProgress,
                detail = "pattern",
            ),
        )

        assertEquals(
            ActivityStatus(
                phase = ActivityPhase.UsingTools,
                label = "grep · pattern",
            ),
            deriveActivityStatus(
                rows = rows,
                isRunning = true,
                hasPendingPermission = false,
            ),
        )
    }

    @Test
    fun returnsReplyingWhileAssistantOutputPresent() {
        val rows = listOf(
            user(),
            TranscriptAssistantRow(turnId = "turn_1", text = "Hello"),
        )

        assertEquals(
            ActivityStatus(
                phase = ActivityPhase.Replying,
                label = "Replying",
            ),
            deriveActivityStatus(
                rows = rows,
                isRunning = true,
                hasPendingPermission = false,
            ),
        )
    }

    @Test
    fun returnsThinkingBeforeAssistantOutput() {
        assertEquals(
            ActivityStatus(
                phase = ActivityPhase.Thinking,
                label = "Thinking",
            ),
            deriveActivityStatus(
                rows = listOf(user()),
                isRunning = true,
                hasPendingPermission = false,
            ),
        )
    }

    @Test
    fun returnsWorkingAfterToolsCompleteBeforeAssistant() {
        val rows = listOf(
            user(),
            tool(toolCallId = "t1", toolName = "read", status = ToolCallStatus.Completed),
        )

        assertEquals(
            ActivityStatus(
                phase = ActivityPhase.Working,
                label = "Working",
            ),
            deriveActivityStatus(
                rows = rows,
                isRunning = true,
                hasPendingPermission = false,
            ),
        )
    }

    private fun user(): TranscriptUserRow =
        TranscriptUserRow(turnId = "turn_1", text = "go")

    private fun tool(
        toolCallId: String,
        toolName: String,
        status: ToolCallStatus,
        toolKind: ToolKind = ToolKind.Read,
        detail: String? = null,
    ): TranscriptToolRow =
        TranscriptToolRow(
            turnId = "turn_1",
            toolCallId = toolCallId,
            toolName = toolName,
            toolKind = toolKind,
            status = status,
            detail = detail,
        )
}
