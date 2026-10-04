package harold.android.chat

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import harold.android.contracts.PermissionOption
import harold.android.contracts.PermissionRequest
import harold.android.contracts.PermissionStatus

fun parseStreamPermission(
    requestId: String,
    sessionId: String,
    params: JsonElement,
    occurredAt: String = "",
): PermissionRequest? {
    val fields = params as? JsonObject ?: return null
    val optionsElement = fields["options"] as? JsonArray ?: return null
    val options = optionsElement.mapNotNull { option ->
        val obj = option as? JsonObject ?: return@mapNotNull null
        val optionId = obj.string("optionId")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
        val name = obj.string("name")?.takeIf { it.isNotEmpty() } ?: return@mapNotNull null
        PermissionOption(optionId = optionId, name = name)
    }
    if (options.isEmpty()) {
        return null
    }

    val toolCall = fields["toolCall"] as? JsonObject
    val toolName = toolCall?.string("name")?.takeIf { it.isNotEmpty() }
        ?: fields.string("toolName")?.takeIf { it.isNotEmpty() }
        ?: "tool"

    return PermissionRequest(
        id = requestId,
        sessionId = sessionId,
        turnId = "stream",
        toolCallId = "stream",
        toolName = toolName,
        status = PermissionStatus.Pending,
        options = options,
        createdAt = occurredAt,
    )
}

private fun JsonObject.string(key: String): String? {
    val value = this[key] as? JsonPrimitive ?: return null
    return value.contentOrNull
}
