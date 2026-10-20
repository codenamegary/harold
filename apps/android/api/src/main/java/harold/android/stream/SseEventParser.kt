package harold.android.stream

/** One SSE event: joined `data` payload plus the optional `id` cursor. */
data class SseEvent(
    val data: String,
    val id: String? = null,
)

/**
 * Incremental server-sent-events line parser. The transport feeds it one line
 * at a time (terminators already stripped by the line reader); a blank line
 * ends the current event and returns it, or null when the block carried no
 * data (heartbeats are `: comment` lines).
 *
 * Follows the SSE field rules: only `data` accumulates, `event`/`retry` are
 * ignored, `id` is captured as the resume cursor, a single leading space after
 * the field colon is removed, and consecutive `data` lines join with newlines.
 */
class SseEventParser {
    private var dataLines: MutableList<String>? = null
    private var eventId: String? = null

    /** Returns the event when this line completed one. */
    fun feed(line: String): SseEvent? {
        if (line.isEmpty()) {
            val pending = dataLines
            dataLines = null
            val id = eventId
            eventId = null
            val data = pending?.joinToString("\n")?.takeIf { it.isNotEmpty() } ?: return null
            return SseEvent(data = data, id = id)
        }
        if (line.startsWith(":")) {
            return null
        }
        val colon = line.indexOf(':')
        val field = if (colon == -1) line else line.substring(0, colon)
        var value = if (colon == -1) "" else line.substring(colon + 1)
        if (value.startsWith(" ")) {
            value = value.substring(1)
        }
        when (field) {
            "data" -> (dataLines ?: mutableListOf<String>().also { dataLines = it }) += value
            "id" -> eventId = value
        }
        return null
    }
}
