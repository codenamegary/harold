package harold.android.transport.ssh

import harold.android.contracts.AgentId
import java.time.Instant
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/** One session reported by an agent through ACP `session/list`. */
data class AcpSessionInfo(
    val agentId: AgentId,
    val sessionId: String,
    val cwd: String,
    val title: String? = null,
    val updatedAt: String? = null,
    val additionalDirectories: List<String> = emptyList(),
)

/** One page of an ACP `session/list` response. */
data class AcpSessionListPage(
    val sessions: List<AcpSessionInfo>,
    val nextCursor: String?,
)

/**
 * A `session_info_update` notification body. [titleChanged] tells a clear
 * (`"title": null`) apart from an update that did not mention the title.
 */
data class AcpSessionInfoPatch(
    val titleChanged: Boolean,
    val title: String?,
    val updatedAt: String?,
)

/**
 * Reads one `session/list` page. Rows missing the required `sessionId` or
 * `cwd` are dropped rather than failing the whole list, so one malformed
 * agent cannot hide every other session.
 */
fun parseSessionListPage(agentId: AgentId, response: JsonElement): AcpSessionListPage {
    val root = response as? JsonObject ?: return AcpSessionListPage(emptyList(), null)
    val sessions = (root["sessions"] as? JsonArray)
        .orEmpty()
        .mapNotNull { element -> parseSessionInfo(agentId, element) }
    val nextCursor = root.string("nextCursor")?.takeIf { it.isNotBlank() }
    return AcpSessionListPage(sessions = sessions, nextCursor = nextCursor)
}

/**
 * Reads a `session_info_update` from the raw payload of a `session/update`
 * notification. Returns null for every other kind of update.
 */
fun parseSessionInfoUpdate(update: JsonObject): AcpSessionInfoPatch? {
    if (update.string("sessionUpdate") != "session_info_update") {
        return null
    }
    val titleChanged = update.containsKey("title")
    val title = if (titleChanged) {
        val element = update["title"]
        if (element is JsonNull) null else (element as? JsonPrimitive)?.content
    } else {
        null
    }
    return AcpSessionInfoPatch(
        titleChanged = titleChanged,
        title = title,
        updatedAt = update.string("updatedAt")?.let(::normalizeTimestamp),
    )
}

/**
 * Compiles per-agent lists into one view. The key is (agent, session) because
 * two agents may use the same session id. Newest first, with sessions that
 * never reported an `updatedAt` last.
 */
fun mergeSessionLists(lists: Iterable<Iterable<AcpSessionInfo>>): List<AcpSessionInfo> {
    val merged = LinkedHashMap<Pair<AgentId, String>, AcpSessionInfo>()
    lists.forEach { sessions ->
        sessions.forEach { session ->
            merged[session.agentId to session.sessionId] = session
        }
    }
    return merged.values.sortedWith(
        compareByDescending<AcpSessionInfo> { session ->
            session.updatedAt?.let { value -> runCatching { Instant.parse(value) }.getOrNull() }
        }
            .thenBy { session -> session.agentId }
            .thenBy { session -> session.sessionId },
    )
}

private fun parseSessionInfo(agentId: AgentId, element: JsonElement): AcpSessionInfo? {
    val value = element as? JsonObject ?: return null
    val sessionId = value.string("sessionId")?.takeIf { it.isNotBlank() } ?: return null
    val cwd = value.string("cwd")?.takeIf { it.isNotBlank() } ?: return null
    val additionalDirectories = (value["additionalDirectories"] as? JsonArray)
        .orEmpty()
        .mapNotNull { entry -> (entry as? JsonPrimitive)?.content }
    return AcpSessionInfo(
        agentId = agentId,
        sessionId = sessionId,
        cwd = cwd,
        title = value.string("title")?.takeIf { it.isNotBlank() },
        updatedAt = value.string("updatedAt")?.let(::normalizeTimestamp),
        additionalDirectories = additionalDirectories,
    )
}

private fun JsonObject.string(key: String): String? {
    val element = this[key] ?: return null
    if (element is JsonNull) {
        return null
    }
    return (element as? JsonPrimitive)?.content
}

private fun normalizeTimestamp(value: String): String =
    runCatching { Instant.parse(value).toString() }.getOrDefault(value)
