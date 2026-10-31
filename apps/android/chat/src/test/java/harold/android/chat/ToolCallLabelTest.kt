package harold.android.chat

import harold.android.contracts.ToolCallStatus
import harold.android.contracts.ToolKind
import harold.android.live.TranscriptToolRow
import org.junit.Assert.assertEquals
import org.junit.Test

class ToolCallLabelTest {
    @Test
    fun namesTheToolAndItsTarget() {
        assertEquals(
            "Read ChatTranscript.kt",
            friendlyToolLabel(tool(name = "read", kind = ToolKind.Read, detail = "ChatTranscript.kt")),
        )
        assertEquals(
            "Run bun test",
            friendlyToolLabel(tool(name = "shell", kind = ToolKind.Execute, detail = "bun test")),
        )
        assertEquals(
            "Edit Theme.kt",
            friendlyToolLabel(tool(name = "edit", kind = ToolKind.Edit, detail = "Theme.kt")),
        )
    }

    @Test
    fun compactsAPathTargetToItsFileName() {
        assertEquals(
            "Read ChatTranscript.kt",
            friendlyToolLabel(
                tool(
                    name = "read",
                    kind = ToolKind.Read,
                    detail = "/home/dev/harold/apps/android/chat/ChatTranscript.kt",
                ),
            ),
        )
    }

    @Test
    fun usesTheToolKindWhenTheNameIsUnknown() {
        assertEquals(
            "Run format",
            friendlyToolLabel(tool(name = "custom", kind = ToolKind.Execute, detail = "format")),
        )
    }

    private fun tool(
        name: String,
        kind: ToolKind,
        detail: String?,
    ): TranscriptToolRow = TranscriptToolRow(
        turnId = "turn_1",
        toolCallId = "t1",
        toolName = name,
        toolKind = kind,
        status = ToolCallStatus.Completed,
        detail = detail,
    )
}
