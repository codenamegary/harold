package harold.android.changes

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints

/**
 * Single-line text that keeps the end visible and puts the ellipsis on the
 * left. Used for paths where the leaf is the useful part.
 */
@Composable
internal fun LeadingEllipsisText(
    text: String,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
) {
    val measurer = rememberTextMeasurer()
    BoxWithConstraints(modifier = modifier) {
        val maxWidthPx = constraints.maxWidth
        val display = remember(text, maxWidthPx, style) {
            if (maxWidthPx == Constraints.Infinity || text.isEmpty()) {
                text
            } else {
                val fullWidth = measurer.measure(text, style).size.width
                if (fullWidth <= maxWidthPx) {
                    text
                } else {
                    leadingEllipsis(text, maxWidthPx) { candidate ->
                        measurer.measure(candidate, style).size.width
                    }
                }
            }
        }
        Text(
            text = display,
            style = style,
            color = color,
            maxLines = 1,
            softWrap = false,
            overflow = TextOverflow.Clip,
        )
    }
}

internal fun leadingEllipsis(
    text: String,
    maxWidthPx: Int,
    widthOf: (String) -> Int,
): String {
    val marker = "…"
    var low = 0
    var high = text.length
    var best = marker
    while (low <= high) {
        val keep = (low + high) / 2
        val candidate = marker + text.takeLast(keep)
        if (widthOf(candidate) <= maxWidthPx) {
            best = candidate
            low = keep + 1
        } else {
            high = keep - 1
        }
    }
    return best
}

internal fun parentDirectory(path: String): String =
    path.substringBeforeLast('/', missingDelimiterValue = "")
