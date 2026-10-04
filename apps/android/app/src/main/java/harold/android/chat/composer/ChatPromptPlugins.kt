package harold.android.chat.composer

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.font.FontWeight
import harold.android.ui.promptinput.PromptPlugin
import harold.android.ui.promptinput.matchTrigger

/** The token kinds the chat composer paints. */
object ChatTokenKind {
    const val TEXT = "text"
    const val COMMAND = "command"
}

/**
 * The chat composer's tokens: plain text plus slash commands. Colours arrive as
 * a [SpanStyle] so the list stays a pure value the caller can remember. Code
 * that only needs to find tokens can leave the style out.
 *
 * Commands are short enough to read in full, so they set no ellipsize limit.
 */
fun chatPromptPlugins(commandStyle: SpanStyle? = null): List<PromptPlugin> = listOf(
    PromptPlugin(kind = ChatTokenKind.TEXT),
    PromptPlugin(
        kind = ChatTokenKind.COMMAND,
        match = matchTrigger("/", ChatTokenKind.COMMAND),
        style = commandStyle,
    ),
)

/** The command chip look: the theme's accent colour, slightly heavier. */
fun commandSpanStyle(color: Color): SpanStyle = SpanStyle(
    color = color,
    fontWeight = FontWeight.SemiBold,
)
