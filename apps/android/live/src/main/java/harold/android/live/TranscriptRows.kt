package harold.android.live

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

/** A resolved agent question. Answers are read-only after resolution. */
data class TranscriptQuestionRow(
    override val turnId: String,
    val requestId: String,
    val title: String,
    val answers: List<Pair<String, String>>,
    /** The ACP tool call this question replaced, when the agent supplied one. */
    val toolCallId: String? = null,
) : TranscriptRow

data class TranscriptToolRow(
    override val turnId: String,
    val toolCallId: String,
    val toolName: String,
    val toolKind: ToolKind,
    val status: ToolCallStatus,
    val detail: String? = null,
) : TranscriptRow
