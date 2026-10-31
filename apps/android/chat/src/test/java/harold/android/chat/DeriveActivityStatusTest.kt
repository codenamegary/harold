package harold.android.chat

import harold.android.contracts.ToolCallStatus
import harold.android.contracts.ToolKind
import harold.android.live.TranscriptAssistantRow
import harold.android.live.TranscriptToolRow
import harold.android.live.TranscriptUserRow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

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
    fun returnsNoStatusWhileAFriendlyToolRowIsVisible() {
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

        assertNull(
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
    fun returnsNoStatusAfterToolsCompleteBeforeAssistant() {
        val rows = listOf(
            user(),
            tool(toolCallId = "t1", toolName = "read", status = ToolCallStatus.Completed),
        )

        assertNull(
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
