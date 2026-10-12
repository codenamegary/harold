package harold.android.ui.promptinput

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.input.TextFieldDecorator
import androidx.compose.foundation.text.input.TextFieldLineLimits
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor

private const val DISABLED_ALPHA = 0.38f

/** Writes a token edit into the field, caret included. */
fun TextFieldState.applyEdit(next: PromptEdit) {
    edit {
        replace(0, length, next.text)
        selection = next.selection
    }
}

/**
 * A plain text field that paints its tokens. The caller owns the text through
 * [state] and describes the tokens through [plugins]; everything on screen is
 * derived from those two on each pass.
 */
@Composable
fun PromptInput(
    state: TextFieldState,
    plugins: List<PromptPlugin>,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    placeholder: String? = null,
    lineLimits: TextFieldLineLimits = TextFieldLineLimits.MultiLine(
        minHeightInLines = 1,
        maxHeightInLines = 5,
    ),
) {
    val textColor = if (enabled) {
        MaterialTheme.colorScheme.onSurface
    } else {
        MaterialTheme.colorScheme.onSurface.copy(alpha = DISABLED_ALPHA)
    }
    val transformation = remember(plugins) { promptOutputTransformation(plugins) }

    BasicTextField(
        state = state,
        modifier = modifier.fillMaxWidth(),
        enabled = enabled,
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = textColor),
        cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
        lineLimits = lineLimits,
        outputTransformation = transformation,
        decorator = TextFieldDecorator { innerTextField ->
            Box(contentAlignment = Alignment.CenterStart) {
                if (placeholder != null && state.text.isEmpty()) {
                    Text(
                        text = placeholder,
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                innerTextField()
            }
        },
    )
}
