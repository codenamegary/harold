package server.agent.android.ui.promptinput

import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange

private const val ELLIPSIS = "…"

/**
 * One painting instruction against a range of the original text. [replacement]
 * is null when the token renders as typed, and shorter text when the token
 * collapses.
 */
data class TokenPaint(
    val range: TextRange,
    val style: SpanStyle?,
    val replacement: String?,
)

/** Shortens [value] to [maxChars] plus an ellipsis, leaving shorter values alone. */
fun ellipsize(value: String, maxChars: Int): String =
    if (value.length <= maxChars) value else value.take(maxChars) + ELLIPSIS

/**
 * Derives how each token paints, matching the web client's chip rules:
 *
 * - a token still being typed paints as plain text
 * - a token the selection touches paints styled but never collapses, so the
 *   caret always sits on the characters the user typed
 * - any other complete token paints styled, collapsed when the plugin sets
 *   `ellipsizeAt` and the token is longer than that
 *
 * Tokens with nothing to paint are left out, so plain text costs no work.
 */
fun paintPrompt(
    text: String,
    selection: TextRange,
    plugins: List<PromptPlugin>,
): List<TokenPaint> {
    val byKind = plugins.associateBy { plugin -> plugin.kind }

    return scanTokens(text, plugins).mapNotNull { token ->
        val plugin = requireNotNull(byKind[token.kind]) {
            "PromptInput: no plugin registered for token kind \"${token.kind}\""
        }
        if (plugin.style == null || !looksComplete(token, text)) {
            return@mapNotNull null
        }

        val collapsed = plugin.ellipsizeAt
            ?.takeIf { max -> !rangeTouches(token, selection) }
            ?.let { max -> ellipsize(token.value, max) }
            ?.takeIf { label -> label != token.value }

        TokenPaint(
            range = TextRange(token.start, token.end),
            style = plugin.style,
            replacement = collapsed,
        )
    }
}
