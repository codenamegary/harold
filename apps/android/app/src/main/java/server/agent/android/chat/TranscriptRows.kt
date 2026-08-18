package server.agent.android.chat

import server.agent.android.contracts.ToolCallStatus
import server.agent.android.contracts.ToolKind

sealed interface TranscriptRow {
    val turnId: String
}

data class TranscriptUserRow(
    override val turnId: String,
    val text: String,
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
