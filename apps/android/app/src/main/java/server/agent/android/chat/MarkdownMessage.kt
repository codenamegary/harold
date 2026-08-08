package server.agent.android.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp

private val fencePattern = Regex("""```(?:\w+)?\n?([\s\S]*?)```""")

@Composable
fun MarkdownMessage(
    text: String,
    modifier: Modifier = Modifier,
) {
    val segments = remember(text) { splitMarkdownSegments(text) }

    SelectionContainer {
        Column(
            modifier = modifier
                .fillMaxWidth()
                .testTag("markdown_message"),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            segments.forEach { segment ->
                when (segment) {
                    is MarkdownSegment.Code -> {
                        Text(
                            text = segment.body.trimEnd(),
                            style = MaterialTheme.typography.bodySmall.copy(
                                fontFamily = FontFamily.Monospace,
                            ),
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f),
                                    shape = RoundedCornerShape(6.dp),
                                )
                                .horizontalScroll(rememberScrollState())
                                .padding(horizontal = 10.dp, vertical = 8.dp),
                        )
                    }

                    is MarkdownSegment.Prose -> {
                        Text(
                            text = styleInlineMarkdown(segment.body),
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
        }
    }
}

internal sealed interface MarkdownSegment {
    data class Prose(val body: String) : MarkdownSegment
    data class Code(val body: String) : MarkdownSegment
}

internal fun splitMarkdownSegments(text: String): List<MarkdownSegment> {
    if (text.isEmpty()) {
        return emptyList()
    }

    val segments = mutableListOf<MarkdownSegment>()
    var cursor = 0
    for (match in fencePattern.findAll(text)) {
        if (match.range.first > cursor) {
            val prose = text.substring(cursor, match.range.first).trim()
            if (prose.isNotEmpty()) {
                segments.add(MarkdownSegment.Prose(prose))
            }
        }
        segments.add(MarkdownSegment.Code(match.groupValues[1]))
        cursor = match.range.last + 1
    }

    if (cursor < text.length) {
        val prose = text.substring(cursor).trim()
        if (prose.isNotEmpty()) {
            segments.add(MarkdownSegment.Prose(prose))
        }
    }

    if (segments.isEmpty()) {
        segments.add(MarkdownSegment.Prose(text))
    }

    return segments
}

internal fun styleInlineMarkdown(text: String): AnnotatedString =
    buildAnnotatedString {
        var index = 0
        while (index < text.length) {
            when {
                text.startsWith("**", index) -> {
                    val end = text.indexOf("**", startIndex = index + 2)
                    if (end >= 0) {
                        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) {
                            append(text.substring(index + 2, end))
                        }
                        index = end + 2
                    } else {
                        append(text[index])
                        index += 1
                    }
                }

                text.startsWith("`", index) -> {
                    val end = text.indexOf('`', startIndex = index + 1)
                    if (end >= 0) {
                        withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) {
                            append(text.substring(index + 1, end))
                        }
                        index = end + 1
                    } else {
                        append(text[index])
                        index += 1
                    }
                }

                else -> {
                    append(text[index])
                    index += 1
                }
            }
        }
    }
