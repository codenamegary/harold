package harold.android.chat

import harold.android.network.LoopbackAddress
import harold.android.network.parseLoopbackUrl

/**
 * Turns loopback addresses in agent prose into tappable links.
 *
 * Agents print `http://localhost:8765`, `localhost:8765` and usually both.
 * The renderer only makes the scheme form clickable, so bare `host:port` gets
 * a markdown link here. Code fences, inline code, autolinks and anything that
 * already is a link, image or reference definition are left alone, because
 * rewriting them yields nested brackets the renderer cannot read.
 */
internal fun linkifyLoopbackUrls(markdown: String): String {
    if (markdown.isEmpty()) {
        return markdown
    }
    val protected = protectedRanges(markdown)
    val out = StringBuilder(markdown.length + 64)
    var index = 0
    while (index < markdown.length) {
        val range = protected.firstOrNull { index >= it.first && index <= it.last }
        if (range != null) {
            out.append(markdown, index, range.last + 1)
            index = range.last + 1
            continue
        }
        val match = loopbackMatchAt(markdown, index)
        if (match == null) {
            out.append(markdown[index])
            index += 1
            continue
        }
        out.append('[')
        out.append(match.text)
        out.append("](")
        out.append(match.address.hostUrl)
        out.append(')')
        index = match.end
    }
    return out.toString()
}

private class LoopbackMatch(
    val text: String,
    val address: LoopbackAddress,
    val end: Int,
)

private val SCHEME_OR_HOST = Regex(
    """^(https?://)?(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{1,5})(/[^\s)\]<>"'`*_~]*)?""",
    RegexOption.IGNORE_CASE,
)

private fun loopbackMatchAt(text: String, index: Int): LoopbackMatch? {
    if (!startsCandidate(text, index)) {
        return null
    }
    val match = SCHEME_OR_HOST.find(text.substring(index)) ?: return null
    val end = index + match.value.length
    // A URL glued to more word characters is part of a longer token, such as
    // a path segment or an IPv4 address, so it is not this link.
    if (end < text.length && continuesToken(text, end)) {
        return null
    }
    val raw = match.value.trimEnd('.', ',', ';', ':', '!', '?')
    val address = parseLoopbackUrl(raw) ?: return null
    return LoopbackMatch(text = raw, address = address, end = index + raw.length)
}

/**
 * True when [end] starts more of the same token rather than closing the
 * sentence. The URL regex stops in front of a period, so `localhost:5173.`
 * hands the full stop to the guard, and a full stop followed by whitespace
 * ends the address instead of extending it.
 */
private fun continuesToken(text: String, end: Int): Boolean {
    val next = text[end]
    if (!isTokenChar(next)) {
        return false
    }
    val closesSentence = next == '.' || next == ',' || next == ';' || next == ':'
    return !(closesSentence && (end + 1 == text.length || text[end + 1].isWhitespace()))
}

private fun startsCandidate(text: String, index: Int): Boolean {
    // A backslash escapes the address, the way markDevServerLinks honours an
    // escaped bracket, so the text stays exactly as the agent typed it.
    if (index > 0 && (isTokenChar(text[index - 1]) || text[index - 1] == '\\')) {
        return false
    }
    val rest = text.substring(index, minOf(text.length, index + 24))
    return rest.startsWith("localhost", ignoreCase = true) ||
        rest.startsWith("127.0.0.1") ||
        rest.startsWith("0.0.0.0") ||
        rest.startsWith("[::1]") ||
        rest.startsWith("http://localhost", ignoreCase = true) ||
        rest.startsWith("https://localhost", ignoreCase = true) ||
        rest.startsWith("http://127.0.0.1") ||
        rest.startsWith("https://127.0.0.1") ||
        rest.startsWith("http://0.0.0.0") ||
        rest.startsWith("https://0.0.0.0") ||
        rest.startsWith("http://[::1]") ||
        rest.startsWith("https://[::1]")
}

private fun isTokenChar(char: Char): Boolean =
    char.isLetterOrDigit() || char == '.' || char == '_' || char == '-' || char == '/'

/**
 * Ranges that must survive verbatim: fenced blocks, inline code spans,
 * existing links and images, autolinks and reference definitions. Overlapping
 * ranges are merged so the scan can move forward in one step.
 */
internal fun protectedRanges(markdown: String): List<IntRange> {
    val ranges = mutableListOf<IntRange>()
    val lines = markdown.split('\n')
    var offset = 0
    var fence: String? = null
    var fenceStart = 0
    for (line in lines) {
        val trimmed = lineWithoutBlockQuote(line)
        val marker = when {
            trimmed.startsWith("```") -> "```"
            trimmed.startsWith("~~~") -> "~~~"
            else -> null
        }
        if (fence == null && marker != null) {
            fence = marker
            fenceStart = offset
        } else if (fence != null && marker == fence) {
            ranges += fenceStart..minOf(offset + line.length, markdown.lastIndex)
            fence = null
        }
        offset += line.length + 1
    }
    if (fence != null) {
        ranges += fenceStart..markdown.lastIndex
    }

    var index = 0
    while (index < markdown.length) {
        when {
            markdown[index] == '`' -> {
                val open = index
                var run = 0
                while (index + run < markdown.length && markdown[index + run] == '`') {
                    run += 1
                }
                val close = markdown.indexOf("`".repeat(run), open + run)
                if (close > 0) {
                    ranges += open..(close + run - 1)
                    index = close + run
                } else {
                    index = open + run
                }
            }

            markdown[index] == '<' -> {
                val close = markdown.indexOf('>', index + 1)
                if (close > 0 && isAutolinkBody(markdown.substring(index + 1, close))) {
                    ranges += index..close
                    index = close + 1
                } else {
                    index += 1
                }
            }

            // Links, images and reference definitions are rewritten as a
            // whole, because linkifying a label or a definition target turns
            // valid markdown into nested brackets.
            markdown[index] == '[' || markdown.startsWith("![", index) -> {
                val open = if (markdown[index] == '[') index else index + 1
                val end = markdownSpanEnd(markdown, open)
                if (end > 0) {
                    ranges += index..end
                    index = end + 1
                } else {
                    index += 1
                }
            }

            else -> index += 1
        }
    }
    return mergeRanges(ranges)
}

/**
 * The line with its block quote markers removed. A fence inside a quote,
 * `> ``` … > ``` `, still opens one, so its contents are not prose.
 */
internal fun lineWithoutBlockQuote(line: String): String {
    var rest = line.trimStart()
    while (rest.startsWith(">")) {
        rest = rest.substring(1).trimStart()
    }
    return rest
}

/** `<http://localhost:3000>` and `<localhost:3000>` are autolinks, not prose. */
private fun isAutolinkBody(body: String): Boolean =
    body.isNotEmpty() && body.contains(':') && body.none { it.isWhitespace() || it == '<' }

/**
 * The last index of the markdown span that starts at [open], a `[` that either
 * follows `!` or opens a link, or -1 when the bracket opens none. Inline
 * targets keep their title, reference links keep their label, and a
 * definition keeps the rest of its line.
 */
private fun markdownSpanEnd(text: String, open: Int): Int {
    val labelClose = closingDelimiter(text, open, ']') ?: return -1
    return when (text.getOrNull(labelClose + 1)) {
        '(' -> closingDelimiter(text, labelClose + 1, ')') ?: -1
        '[' -> closingDelimiter(text, labelClose + 1, ']') ?: -1
        ':' -> referenceDefinitionEnd(text, open, labelClose) ?: -1
        else -> -1
    }
}

/** Index of the delimiter that closes the one at [open], counting nesting. */
private fun closingDelimiter(text: String, open: Int, close: Char): Int? {
    val opener = if (close == ']') '[' else '('
    var depth = 0
    var cursor = open
    while (cursor < text.length) {
        when (text[cursor]) {
            opener -> depth += 1
            close -> {
                depth -= 1
                if (depth == 0) {
                    return cursor
                }
            }
        }
        cursor += 1
    }
    return null
}

/**
 * The last index of `[label]: target` when it starts its own line. A label
 * holding a colon is an IPv6 literal such as `[::1]:3000`, so it stays a link
 * candidate instead of a definition.
 */
private fun referenceDefinitionEnd(text: String, open: Int, labelClose: Int): Int? {
    val label = text.substring(open + 1, labelClose)
    if (label.isEmpty() || label.contains('\n') || label.contains(':')) {
        return null
    }
    var lineStart = open
    while (lineStart > 0 && text[lineStart - 1] != '\n') {
        if (!text[lineStart - 1].isWhitespace()) {
            return null
        }
        lineStart -= 1
    }
    val lineEnd = text.indexOf('\n', labelClose).let { if (it < 0) text.length else it }
    val target = text.substring(labelClose + 2, lineEnd).trim()
    return if (target.isEmpty()) null else lineEnd - 1
}

private fun mergeRanges(ranges: List<IntRange>): List<IntRange> {
    if (ranges.isEmpty()) {
        return emptyList()
    }
    val sorted = ranges.sortedBy { it.first }
    val merged = mutableListOf(sorted.first())
    for (range in sorted.drop(1)) {
        val last = merged.last()
        if (range.first <= last.last + 1) {
            merged[merged.lastIndex] = last.first..maxOf(last.last, range.last)
        } else {
            merged += range
        }
    }
    return merged
}
