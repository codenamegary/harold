package server.agent.android.chat.composer

import server.agent.android.contracts.AvailableCommand

/**
 * Stateless command-list rules shared by keyboard and voice modes. The list's
 * visibility and contents in keyboard mode are pure functions of the composer
 * text: a trailing /token opens it, the token filters it, and deleting the
 * slash closes it. Voice mode toggles the same list from a button instead.
 */

private val TRAILING_SLASH_TOKEN = Regex("""(?:^|\s)/(\S*)$""")

/**
 * The active command query: the text after a trailing `/` that sits at the
 * start of the text or after whitespace. Null when the caret's trailing token
 * is not a command, which is what closes the list.
 */
fun activeSlashQuery(composerText: String): String? {
    val match = TRAILING_SLASH_TOKEN.find(composerText) ?: return null
    return match.groupValues[1]
}

/**
 * Relevance ranking ported from the web client's commands.filter.ts:
 * name prefix, name contains, description prefix, description contains.
 * An empty query returns the catalog in its original order.
 */
fun filterCommands(
    commands: List<AvailableCommand>,
    query: String,
): List<AvailableCommand> {
    if (query.isEmpty()) {
        return commands
    }
    val q = query.lowercase()

    val ranked = commands.map { command ->
        val name = command.name.lowercase()
        val description = command.description.lowercase()
        val rank = when {
            name.startsWith(q) -> 0
            name.contains(q) -> 1
            description.startsWith(q) -> 2
            description.contains(q) -> 3
            else -> -1
        }
        command to rank
    }

    return ranked
        .filter { (_, rank) -> rank >= 0 }
        .sortedBy { (_, rank) -> rank }
        .map { (command, _) -> command }
}

/** Replaces the trailing /token with the completed command plus a space. */
fun completeSlashCommand(composerText: String, commandName: String): String {
    val slashIndex = trailingSlashIndex(composerText) ?: return composerText
    return composerText.take(slashIndex) + "/$commandName "
}

/** Removes the trailing /token, used by the panel's explicit close. */
fun removeTrailingSlashToken(composerText: String): String {
    val slashIndex = trailingSlashIndex(composerText) ?: return composerText
    return composerText.take(slashIndex).trimEnd()
}

private fun trailingSlashIndex(composerText: String): Int? {
    val match = TRAILING_SLASH_TOKEN.find(composerText) ?: return null
    return match.range.first + match.value.indexOf('/')
}

/**
 * The rail's / button is a shortcut for typing a slash: appends `/`, with a
 * separating space when the text does not already end in whitespace.
 */
fun insertSlashShortcut(composerText: String): String = when {
    composerText.isEmpty() -> "/"
    composerText.last().isWhitespace() -> "$composerText/"
    else -> "$composerText /"
}
