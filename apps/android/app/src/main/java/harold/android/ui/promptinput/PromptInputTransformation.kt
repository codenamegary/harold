package harold.android.ui.promptinput

import androidx.compose.foundation.text.input.OutputTransformation
import androidx.compose.foundation.text.input.TextFieldBuffer
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange

/**
 * Renders the tokens in a [PromptInput] without touching the stored text.
 * Collapsed tokens change the rendered length, so replacements run first and
 * styles land on the finished ranges. Compose maps caret offsets across the
 * change for us.
 */
fun promptOutputTransformation(plugins: List<PromptPlugin>): OutputTransformation =
    OutputTransformation {
        val text = originalText.toString()
        applyPaints(paintPrompt(text, originalSelection, plugins))
    }

private fun TextFieldBuffer.applyPaints(paints: List<TokenPaint>) {
    val styled = mutableListOf<Pair<SpanStyle, TextRange>>()
    var shift = 0

    paints.forEach { paint ->
        val start = paint.range.start + shift
        val end = paint.range.end + shift
        val painted = paint.replacement?.let { replacement ->
            replace(start, end, replacement)
            shift += replacement.length - paint.range.length
            TextRange(start, start + replacement.length)
        } ?: TextRange(start, end)

        paint.style?.let { style -> styled.add(style to painted) }
    }

    styled.forEach { (style, range) -> addStyle(style, range.start, range.end) }
}
