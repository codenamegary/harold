package harold.android.chat

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import harold.android.contracts.ToolCallStatus
import harold.android.contracts.ToolKind

sealed interface ParsedAcpUpdate {
    data class AgentMessageChunk(val text: String) : ParsedAcpUpdate

    data class AgentThoughtChunk(val text: String) : ParsedAcpUpdate

    data class ToolCall(
        val toolCallId: String,
        val toolName: String,
        val toolKind: ToolKind,
        val status: ToolCallStatus,
        val detail: String? = null,
    ) : ParsedAcpUpdate

    data class ToolCallUpdate(
        val toolCallId: String,
        val toolName: String? = null,
        val toolKind: ToolKind? = null,
        val status: ToolCallStatus,
        val detail: String? = null,
    ) : ParsedAcpUpdate

    data class UserMessageChunk(val text: String) : ParsedAcpUpdate

    data object Ignored : ParsedAcpUpdate
}

fun parseAcpUpdate(update: JsonElement): ParsedAcpUpdate {
    val fields = update as? JsonObject ?: return ParsedAcpUpdate.Ignored
    val updateKind = readUpdateKind(fields) ?: return ParsedAcpUpdate.Ignored

    return when (updateKind) {
        "agent_message_chunk" -> {
            val text = readChunkText(fields) ?: return ParsedAcpUpdate.Ignored
            ParsedAcpUpdate.AgentMessageChunk(text)
        }
        "agent_thought_chunk" -> {
            val text = readChunkText(fields) ?: return ParsedAcpUpdate.Ignored
            ParsedAcpUpdate.AgentThoughtChunk(text)
        }
        "tool_call" -> {
            val toolCallId = fields.string("toolCallId")?.takeIf { it.isNotEmpty() }
                ?: return ParsedAcpUpdate.Ignored
            val toolName = readToolName(fields) ?: return ParsedAcpUpdate.Ignored
            ParsedAcpUpdate.ToolCall(
                toolCallId = toolCallId,
                toolName = toolName,
                toolKind = readToolKind(fields),
                status = readToolStatus(fields, default = ToolCallStatus.Pending)
                    ?: ToolCallStatus.Pending,
            )
        }
        "tool_call_update" -> {
            val toolCallId = fields.string("toolCallId")?.takeIf { it.isNotEmpty() }
                ?: return ParsedAcpUpdate.Ignored
            val status = readToolStatus(fields, default = null) ?: return ParsedAcpUpdate.Ignored
            ParsedAcpUpdate.ToolCallUpdate(
                toolCallId = toolCallId,
                toolName = readToolName(fields),
                toolKind = readOptionalToolKind(fields),
                status = status,
            )
        }
        "user_message_chunk" -> {
            val text = readChunkText(fields) ?: return ParsedAcpUpdate.Ignored
            if (text.isEmpty()) {
                return ParsedAcpUpdate.Ignored
            }
            ParsedAcpUpdate.UserMessageChunk(text)
        }
        else -> ParsedAcpUpdate.Ignored
    }
}

private fun readUpdateKind(fields: JsonObject): String? =
    fields.string("sessionUpdate")
        ?: fields.string("updateKind")
        ?: fields.string("kind")

private fun readChunkText(fields: JsonObject): String? {
    fields.string("text")?.let { return it }

    val content = fields["content"] ?: return null
    if (content is JsonPrimitive) {
        return content.contentOrNull
    }
    if (content is JsonObject) {
        return content.string("text")
    }
    return null
}

private fun readToolName(fields: JsonObject): String? =
    fields.string("toolName")?.takeIf { it.isNotEmpty() }
        ?: fields.string("name")?.takeIf { it.isNotEmpty() }
        ?: fields.string("title")?.takeIf { it.isNotEmpty() }

private fun readToolKind(fields: JsonObject): ToolKind =
    readOptionalToolKind(fields) ?: ToolKind.Execute

private fun readOptionalToolKind(fields: JsonObject): ToolKind? {
    val raw = fields.string("toolKind") ?: fields.string("kind") ?: return null
    return when (raw) {
        "read" -> ToolKind.Read
        "edit" -> ToolKind.Edit
        "execute" -> ToolKind.Execute
        else -> null
    }
}

private fun readToolStatus(fields: JsonObject, default: ToolCallStatus?): ToolCallStatus? {
    val raw = fields.string("status") ?: return default
    return when (raw) {
        "pending" -> ToolCallStatus.Pending
        "in_progress" -> ToolCallStatus.InProgress
        "completed" -> ToolCallStatus.Completed
        "failed" -> ToolCallStatus.Failed
        else -> default
    }
}

private fun JsonObject.string(key: String): String? {
    val value = this[key] as? JsonPrimitive ?: return null
    return value.contentOrNull
}
