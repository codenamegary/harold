package harold.android.chat

import harold.android.contracts.ToolCallStatus
import harold.android.contracts.ToolKind

sealed interface TranscriptRow {
    val turnId: String
}

data class TranscriptUserRow(
    override val turnId: String,
    val text: String,
    val attachmentNames: List<String> = emptyList(),
) : TranscriptRow

data class TranscriptThinkingRow(
    override val turnId: String,
    val text: String,
) : TranscriptRow

data class TranscriptAssistantRow(
    override val turnId: String,
    val text: String,
) : TranscriptRow

data class TranscriptToolRow(
    override val turnId: String,
    val toolCallId: String,
    val toolName: String,
    val toolKind: ToolKind,
    val status: ToolCallStatus,
    val detail: String? = null,
) : TranscriptRow
