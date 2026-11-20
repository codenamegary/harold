package harold.android.chat

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mikepenz.markdown.compose.extendedspans.ExtendedSpanPainter
import com.mikepenz.markdown.compose.extendedspans.ExtendedSpans
import com.mikepenz.markdown.compose.extendedspans.SpanDrawInstructions
import com.mikepenz.markdown.model.MarkdownExtendedSpans
import com.mikepenz.markdown.model.markdownExtendedSpans
import harold.android.network.parseLoopbackUrl

/**
 * What a forwarded link carries in front of its text: the letter that stands
 * for the Harold mark, plus a thin space so it does not touch the URL.
 *
 * It is a character inside the link label rather than the `ic_harold_glyph_mark`
 * vector because the renderer has no per-link slot for a composable, and inline
 * content is a sibling of the text: it cannot see the link's pressed style, so
 * the mark would keep its colour while the text dimmed. Inside the label the
 * press style reaches both.
 */
internal const val DEV_SERVER_LINK_MARK = "H\u2009"

/** String annotation that picks out the URL text of a tagged loopback link. */
internal const val DEV_SERVER_LINK_TAG = "harold_dev_server_link"

private const val PRESSED_LINK_ALPHA = 0.55f
private const val UNDERLINE_ALPHA = 0.7f
private const val MARK_FONT_SIZE_SP = 12
private const val UNDERLINE_STROKE_DP = 1.2f
private const val UNDERLINE_DASH_DP = 0.1f
private const val UNDERLINE_GAP_DP = 1.8f
private const val UNDERLINE_OFFSET_DP = 1.5f

/**
 * Puts [DEV_SERVER_LINK_MARK] inside the label of every loopback link.
 *
 * [linkifyLoopbackUrls] only rewrites prose addresses into `[label](target)`.
 * Which of the resulting links the app will forward over SSH is known here, at
 * the markdown level, so the tag lives in the label text: the renderer keeps
 * link labels verbatim, which makes the mark both visible and detectable from
 * the annotated string. Ordinary links, code spans, fenced blocks, images and
 * reference definitions are copied byte for byte, and running this twice
 * changes nothing.
 */
internal fun markDevServerLinks(markdown: String): String {
    if (markdown.isEmpty()) {
        return markdown
    }
    val out = StringBuilder(markdown.length + 16)
    var fence: String? = null
    markdown.split('\n').forEachIndexed { index, line ->
        if (index > 0) {
            out.append('\n')
        }
        val marker = fenceMarker(line)
        when {
            fence == null && marker != null -> {
                fence = marker
                out.append(line)
            }

            fence != null -> {
                if (marker == fence) {
                    fence = null
                }
                out.append(line)
            }

            else -> out.append(markLoopbackLinksInLine(line))
        }
    }
    return out.toString()
}

/** True when a link over [start, end) already carries the loopback mark. */
private fun isDevServerLinkLabel(text: AnnotatedString, start: Int, end: Int): Boolean =
    end - start > DEV_SERVER_LINK_MARK.length &&
        text.text.startsWith(DEV_SERVER_LINK_MARK, start)

private fun fenceMarker(line: String): String? {
    val trimmed = lineWithoutBlockQuote(line)
    return when {
        trimmed.startsWith("```") -> "```"
        trimmed.startsWith("~~~") -> "~~~"
        else -> null
    }
}

private class LoopbackInlineLink(
    val label: String,
    val target: String,
    val end: Int,
)

private fun markLoopbackLinksInLine(line: String): String {
    val out = StringBuilder(line.length + 16)
    var index = 0
    while (index < line.length) {
        val char = line[index]
        when {
            char == '`' -> {
                val end = codeSpanEnd(line, index)
                out.append(line, index, end)
                index = end
            }

            char == '[' && !isEscaped(line, index) && !isImageLabel(line, index) -> {
                val link = loopbackInlineLinkAt(line, index)
                if (link == null) {
                    out.append(char)
                    index += 1
                } else {
                    out.append('[')
                    if (!link.label.startsWith(DEV_SERVER_LINK_MARK)) {
                        out.append(DEV_SERVER_LINK_MARK)
                    }
                    out.append(link.label)
                    out.append("](")
                    out.append(link.target)
                    out.append(')')
                    index = link.end
                }
            }

            else -> {
                out.append(char)
                index += 1
            }
        }
    }
    return out.toString()
}

/** The index after the code span that opens at [open], which holds [open] itself. */
private fun codeSpanEnd(line: String, open: Int): Int {
    var run = 0
    while (open + run < line.length && line[open + run] == '`') {
        run += 1
    }
    val close = line.indexOf("`".repeat(run), open + run)
    return if (close < 0) open + run else close + run
}

private fun isEscaped(line: String, index: Int): Boolean =
    index > 0 && line[index - 1] == '\\'

private fun isImageLabel(line: String, index: Int): Boolean =
    index > 0 && line[index - 1] == '!'

/**
 * The `[label](target)` link that opens at [open] and points at the host's own
 * loopback, or null when the brackets there are anything else. A bare
 * `[label][ref]` reference link is not resolved, because its target lives
 * somewhere else in the document and the loopback pass leaves those alone too.
 */
private fun loopbackInlineLinkAt(line: String, open: Int): LoopbackInlineLink? {
    val labelEnd = closingDelimiter(line, open, '[', ']') ?: return null
    if (line.getOrNull(labelEnd + 1) != '(') {
        return null
    }
    val targetEnd = closingDelimiter(line, labelEnd + 1, '(', ')') ?: return null
    val target = line.substring(labelEnd + 2, targetEnd)
    // The target may carry a title, as in `[x](http://localhost:3000 "dev")`,
    // and may be wrapped in angle brackets; only the address part decides
    // whether the app will forward the link.
    if (parseLoopbackUrl(linkDestination(target)) == null) {
        return null
    }
    return LoopbackInlineLink(
        label = line.substring(open + 1, labelEnd),
        target = target,
        end = targetEnd + 1,
    )
}

/** The address part of an inline link target, without a title or brackets. */
private fun linkDestination(target: String): String {
    val trimmed = target.trim()
    if (trimmed.startsWith("<")) {
        val close = trimmed.indexOf('>')
        if (close > 0) {
            return trimmed.substring(1, close)
        }
    }
    return trimmed.takeWhile { char -> !char.isWhitespace() }
}

private fun closingDelimiter(line: String, open: Int, opener: Char, closer: Char): Int? {
    var depth = 0
    var cursor = open
    while (cursor < line.length) {
        when (line[cursor]) {
            opener -> depth += 1
            closer -> {
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
 * Gives tagged loopback links a treatment ordinary links do not have: the solid
 * underline is dropped for a dotted line under the URL text, and the mark in the
 * label is shrunk so it reads as a mark rather than as part of the address.
 *
 * The link style only sets a colour and removes the underline, so the mark keeps
 * its own size and weight. The mark is the one sub-range that does get a style,
 * because it is the brand mark and not the address. A colour on a narrower span
 * does override the link colour in this renderer, which is also why the mark
 * still dims on press: the pressed style wins by being the innermost style on
 * the same range when Compose merges the spans.
 */
internal class DevServerLinkSpanPainter(
    private val linkColor: Color,
    private val underlineColor: Color,
    private val markColor: Color,
) : ExtendedSpanPainter() {
    private val markStyle = SpanStyle(
        fontSize = MARK_FONT_SIZE_SP.sp,
        fontWeight = FontWeight.Bold,
        color = markColor,
    )

    override fun decorate(
        span: SpanStyle,
        start: Int,
        end: Int,
        text: AnnotatedString,
        builder: AnnotatedString.Builder,
    ): SpanStyle = span

    override fun decorate(
        linkAnnotation: LinkAnnotation,
        start: Int,
        end: Int,
        text: AnnotatedString,
        builder: AnnotatedString.Builder,
    ): LinkAnnotation {
        if (linkAnnotation !is LinkAnnotation.Url || !isDevServerLinkLabel(text, start, end)) {
            return linkAnnotation
        }
        val textStart = start + DEV_SERVER_LINK_MARK.length
        builder.addStyle(markStyle, start, textStart)
        if (textStart < end) {
            builder.addStringAnnotation(DEV_SERVER_LINK_TAG, linkAnnotation.url, textStart, end)
        }
        return LinkAnnotation.Url(
            url = linkAnnotation.url,
            styles = linkStyles(),
            linkInteractionListener = linkAnnotation.linkInteractionListener,
        )
    }

    override fun drawInstructionsFor(
        layoutResult: TextLayoutResult,
        color: Color?,
    ): SpanDrawInstructions {
        val layoutText = layoutResult.layoutInput.text
        val ranges = layoutText.getStringAnnotations(DEV_SERVER_LINK_TAG, 0, layoutText.length)
        return SpanDrawInstructions {
            if (ranges.isNotEmpty()) {
                val strokeWidth = UNDERLINE_STROKE_DP.dp.toPx()
                val pathEffect = PathEffect.dashPathEffect(
                    floatArrayOf(
                        UNDERLINE_DASH_DP.dp.toPx(),
                        UNDERLINE_GAP_DP.dp.toPx(),
                    ),
                )
                for (range in ranges) {
                    for (rect in layoutResult.getBoundingBoxes(range.start, range.end)) {
                        val y = rect.bottom + UNDERLINE_OFFSET_DP.dp.toPx()
                        drawLine(
                            color = underlineColor,
                            start = Offset(rect.left, y),
                            end = Offset(rect.right, y),
                            strokeWidth = strokeWidth,
                            cap = StrokeCap.Round,
                            pathEffect = pathEffect,
                        )
                    }
                }
            }
        }
    }

    private fun linkStyles(): TextLinkStyles {
        // No colour in the resting style: a link style colour wins over the
        // narrower span the mark carries, which would paint the accent mark in
        // the text colour. Leaving it unset lets the mark keep its own colour
        // and lets the address inherit the body colour, and the pressed style
        // then dims both because it is the colour for the whole link range.
        val style = SpanStyle(textDecoration = TextDecoration.None)
        return TextLinkStyles(
            style = style,
            pressedStyle = style.copy(color = linkColor.copy(alpha = PRESSED_LINK_ALPHA)),
        )
    }
}

/**
 * The extended spans that paint tagged loopback links.
 *
 * The colours are resolved here because a painter runs outside composition, and
 * they follow the body text colour the markdown renderer uses for links today.
 */
@Composable
internal fun devServerLinkExtendedSpans(): MarkdownExtendedSpans {
    val linkColor = MaterialTheme.colorScheme.onBackground
    val underlineColor = linkColor.copy(alpha = UNDERLINE_ALPHA)
    // The mark is the brand mark, so it carries the accent rather than the text
    // colour: that is what tells the eye which part of the link Harold owns.
    val markColor = MaterialTheme.colorScheme.primary
    return markdownExtendedSpans {
        remember(linkColor, underlineColor, markColor) {
            ExtendedSpans(
                DevServerLinkSpanPainter(
                    linkColor = linkColor,
                    underlineColor = underlineColor,
                    markColor = markColor,
                ),
            )
        }
    }
}
