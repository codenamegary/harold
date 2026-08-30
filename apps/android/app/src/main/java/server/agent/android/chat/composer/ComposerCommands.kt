package server.agent.android.chat.composer

import androidx.compose.ui.text.TextRange
import server.agent.android.contracts.AvailableCommand
import server.agent.android.ui.promptinput.PromptEdit
import server.agent.android.ui.promptinput.Token
import server.agent.android.ui.promptinput.replaceToken
import server.agent.android.ui.promptinput.scanTokens
import server.agent.android.ui.promptinput.tokenAtCaret

/**
 * Stateless command-list rules shared by keyboard and voice modes. In keyboard
 * mode the list's visibility and contents are pure functions of the composer
 * text and the caret: a command token under the caret opens it, the token
 * filters it, and moving off or deleting the slash closes it. Voice mode
 * toggles the same list from a button instead.
 */

/**
 * The command token holding the caret, or null when the caret is elsewhere. A
 * caret on a token boundary belongs to the token that ends there, so typing at
 * the tail of `/cmd` keeps it active. A range selection has no active token.
 */
fun activeCommandToken(composerText: String, selection: TextRange): Token? {
    if (!selection.collapsed) {
        return null
    }
    val tokens = scanTokens(composerText, chatPromptPlugins())
    return tokenAtCaret(tokens, selection.start)
        ?.takeIf { token -> token.kind == ChatTokenKind.COMMAND }
}

/** The active command's query: the text after its `/`. Null closes the list. */
fun activeCommandQuery(composerText: String, selection: TextRange): String? =
    activeCommandToken(composerText, selection)?.value?.removePrefix("/")

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

/** Replaces the active command token with the completed command plus a space. */
fun completeSlashCommand(
    composerText: String,
    selection: TextRange,
    commandName: String,
): PromptEdit {
    val token = activeCommandToken(composerText, selection)
        ?: return PromptEdit(composerText, selection)
    return replaceToken(composerText, token, "/$commandName")
}

/**
 * Drops the active command token, used by the panel's explicit close. A token
 * at the end of the text takes the space before it with it, so closing the
 * panel leaves no dangling whitespace.
 */
fun removeCommandToken(composerText: String, selection: TextRange): PromptEdit {
    val token = activeCommandToken(composerText, selection)
        ?: return PromptEdit(composerText, selection)
    val before = composerText.take(token.start)
    val after = composerText.substring(token.end)
    val head = if (after.isEmpty()) before.trimEnd() else before
    return PromptEdit(text = head + after, selection = TextRange(head.length))
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
