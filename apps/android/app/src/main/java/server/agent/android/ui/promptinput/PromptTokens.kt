package server.agent.android.ui.promptinput

import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange

/**
 * The token model behind [PromptInput], ported from the web client's
 * prompt.input.model.ts. Every function here is pure: tokens are derived from
 * the text and the selection on each pass, never stored.
 */
data class Token(
    val kind: String,
    val value: String,
    val start: Int,
    val end: Int,
)

/** Returns the token starting exactly at [offset], or null when it does not match. */
typealias Matcher = (text: String, offset: Int) -> Token?

/**
 * A token kind plus how it paints. Exactly one plugin in a list leaves [match]
 * null: that plugin owns the plain text between matches.
 *
 * [ellipsizeAt] collapses a complete token the selection is not touching down
 * to that many characters plus an ellipsis, the way the web client shortens
 * long chips.
 */
data class PromptPlugin(
    val kind: String,
    val match: Matcher? = null,
    val style: SpanStyle? = null,
    val ellipsizeAt: Int? = null,
)

/** Matches a [trigger] that starts the text or follows whitespace, up to the next space. */
fun matchTrigger(trigger: String, kind: String): Matcher {
    val pattern = Regex("^${Regex.escape(trigger)}\\S*")
    return { text, offset ->
        if (!isTriggerStart(text, offset, trigger)) {
            null
        } else {
            pattern.find(text.substring(offset))?.value?.let { value ->
                Token(kind = kind, value = value, start = offset, end = offset + value.length)
            }
        }
    }
}

private fun isTriggerStart(text: String, offset: Int, trigger: String): Boolean {
    if (!text.startsWith(trigger, offset)) {
        return false
    }
    if (offset == 0) {
        return true
    }
    return text[offset - 1].isWhitespace()
}

/** Splits [text] into contiguous tokens that cover it end to end. */
fun scanTokens(text: String, plugins: List<PromptPlugin>): List<Token> {
    val textKind = textKindOf(plugins)
    if (text.isEmpty()) {
        return emptyList()
    }

    return buildList {
        var offset = 0
        while (offset < text.length) {
            val matched = matchAt(text, offset, plugins)
            if (matched != null) {
                add(matched)
                offset = matched.end
                continue
            }
            val next = findNextMatch(text, offset + 1, plugins)
            val end = if (next == -1) text.length else next
            add(
                Token(
                    kind = textKind,
                    value = text.substring(offset, end),
                    start = offset,
                    end = end,
                ),
            )
            offset = end
        }
    }
}

private fun textKindOf(plugins: List<PromptPlugin>): String {
    val textPlugins = plugins.filter { plugin -> plugin.match == null }
    require(textPlugins.size == 1) {
        "PromptInput: exactly one plugin without match is required for text spans"
    }
    return textPlugins.first().kind
}

private fun matchAt(text: String, offset: Int, plugins: List<PromptPlugin>): Token? {
    plugins.forEach { plugin ->
        val token = plugin.match?.invoke(text, offset)
        if (token != null) {
            require(token.start == offset && token.end > offset) {
                "PromptInput: match must consume from the current offset"
            }
            return token.copy(kind = plugin.kind)
        }
    }
    return null
}

private fun findNextMatch(text: String, from: Int, plugins: List<PromptPlugin>): Int {
    (from until text.length).forEach { offset ->
        if (matchAt(text, offset, plugins) != null) {
            return offset
        }
    }
    return -1
}

/** Fails when [tokens] do not concatenate to [text] over contiguous offsets. */
fun assertTokensMatchValue(text: String, tokens: List<Token>) {
    require(tokens.joinToString("") { token -> token.value } == text) {
        "PromptInput: tokens must concatenate to value"
    }

    val coverage = tokens.fold(0) { offset, token ->
        require(
            token.start == offset &&
                token.end == offset + token.value.length &&
                token.value == text.substring(token.start, token.end),
        ) {
            "PromptInput: token offsets must be contiguous and match token.value"
        }
        token.end
    }

    require(coverage == text.length) {
        "PromptInput: tokens must cover the full value"
    }
}

/** A caret on a boundary belongs to the token that ends there. */
fun caretIsInside(token: Token, caret: Int): Boolean =
    caret >= token.start && caret <= token.end

/** The token a collapsed caret sits in, or null past the end of the text. */
fun tokenAtCaret(tokens: List<Token>, caret: Int): Token? =
    tokens.firstOrNull { token -> caretIsInside(token, caret) }

/** Whether [selection] holds or overlaps [token], which keeps a chip expanded. */
fun rangeTouches(token: Token, selection: TextRange): Boolean {
    if (selection.collapsed) {
        return caretIsInside(token, selection.start)
    }
    return selection.min < token.end && selection.max > token.start
}

fun followedByWhitespace(token: Token, text: String): Boolean =
    text.getOrNull(token.end)?.isWhitespace() == true

/** A token is done growing once whitespace or the end of the text follows it. */
fun looksComplete(token: Token, text: String): Boolean =
    followedByWhitespace(token, text) || token.end == text.length

/** The text and caret produced by an edit, ready to push into a TextFieldState. */
data class PromptEdit(
    val text: String,
    val selection: TextRange,
)

/**
 * Swaps [token] for [replacement] and leaves the caret past a single trailing
 * space. Reuses a space that already follows so completing mid-sentence does
 * not double it.
 */
fun replaceToken(text: String, token: Token, replacement: String): PromptEdit {
    val spaceFollows = followedByWhitespace(token, text)
    val inserted = if (spaceFollows) replacement else "$replacement "
    val caret = token.start + inserted.length + if (spaceFollows) 1 else 0
    return PromptEdit(
        text = text.take(token.start) + inserted + text.substring(token.end),
        selection = TextRange(caret),
    )
}
