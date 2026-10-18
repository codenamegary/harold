package harold.android.stream

/**
 * Incremental server-sent-events line parser. The transport feeds it one line
 * at a time (terminators already stripped by the line reader); a blank line
 * ends the current event and returns its joined `data` payload, or null when
 * the block carried no data (heartbeats are `: comment` lines).
 *
 * Follows the SSE field rules: only `data` accumulates, `event`/`id`/`retry`
 * are ignored, a single leading space after the field colon is removed, and
 * consecutive `data` lines join with newlines.
 */
class SseEventParser {
    private var dataLines: MutableList<String>? = null

    /** Returns the joined payload when this line completed an event. */
    fun feed(line: String): String? {
        if (line.isEmpty()) {
            val pending = dataLines
            dataLines = null
            return pending?.joinToString("\n")?.takeIf { it.isNotEmpty() }
        }
        if (line.startsWith(":")) {
            return null
        }
        val colon = line.indexOf(':')
        val field = if (colon == -1) line else line.substring(0, colon)
        if (field != "data") {
            return null
        }
        var value = if (colon == -1) "" else line.substring(colon + 1)
        if (value.startsWith(" ")) {
            value = value.substring(1)
        }
        (dataLines ?: mutableListOf<String>().also { dataLines = it }) += value
        return null
    }
}
