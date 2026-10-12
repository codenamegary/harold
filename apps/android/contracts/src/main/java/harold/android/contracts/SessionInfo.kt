package harold.android.contracts

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * A parsed ACP session_info_update. [Title] carries an explicit title
 * (null clears it); [Marker] is an update with no usable title, such as the
 * _meta markers OpenCode sends for retry and compaction.
 */
sealed interface ParsedSessionInfoUpdate {
    data class Title(val title: String?) : ParsedSessionInfoUpdate

    data object Marker : ParsedSessionInfoUpdate
}

/**
 * Parses a session_update payload as an ACP session_info_update. Returns null
 * when the update is a different kind or the shape is invalid, matching the
 * server's safeParse behavior.
 */
fun parseSessionInfoUpdate(update: JsonElement): ParsedSessionInfoUpdate? {
    val obj = update as? JsonObject ?: return null
    val kind = (obj["sessionUpdate"] as? JsonPrimitive)?.contentOrNull ?: return null
    if (kind != "session_info_update") {
        return null
    }

    val title = obj["title"] ?: return ParsedSessionInfoUpdate.Marker
    if (title is JsonNull) {
        return ParsedSessionInfoUpdate.Title(null)
    }
    if (title is JsonPrimitive && title.isString) {
        return ParsedSessionInfoUpdate.Title(title.content)
    }
    return ParsedSessionInfoUpdate.Marker
}
