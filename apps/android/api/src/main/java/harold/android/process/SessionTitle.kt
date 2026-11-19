package harold.android.process

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

private val TITLE_TIME = DateTimeFormatter.ofPattern("HH:mm:ss")
private val TITLE_TIME_SUFFIX = Regex("""\d{2}:\d{2}:\d{2}""")
private const val TITLE_SEPARATOR = " · "

/**
 * A unique, readable title for a session the agent has not named yet. Uses the
 * folder basename plus the local creation time, so two new sessions never share
 * the generic "New session" label in the picker.
 */
fun initialSessionTitle(
    cwd: String,
    now: Instant = Instant.now(),
    zone: ZoneId = ZoneId.systemDefault(),
): String {
    val name = cwd.trimEnd('/').substringAfterLast('/').ifBlank { "Session" }
    return "$name$TITLE_SEPARATOR${TITLE_TIME.withZone(zone).format(now)}"
}

/**
 * True when [title] has the `name · HH:mm:ss` shape [initialSessionTitle]
 * produces. The picker treats those as placeholders worth replacing with the
 * agent's own title once it arrives.
 */
fun isInitialSessionTitle(title: String): Boolean {
    val separator = title.lastIndexOf(TITLE_SEPARATOR)
    if (separator <= 0) {
        return false
    }
    return TITLE_TIME_SUFFIX.matches(title.substring(separator + TITLE_SEPARATOR.length))
}
