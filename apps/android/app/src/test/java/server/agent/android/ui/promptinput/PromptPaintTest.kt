package server.agent.android.ui.promptinput

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PromptPaintTest {
    private val commandStyle = SpanStyle(color = Color.Green)
    private val mentionStyle = SpanStyle(color = Color.Magenta)

    private val textPlugin = PromptPlugin(kind = "text")
    private val commandPlugin = PromptPlugin(
        kind = "command",
        match = matchTrigger("/", "command"),
        style = commandStyle,
    )
    private val mentionPlugin = PromptPlugin(
        kind = "mention",
        match = matchTrigger("@", "mention"),
        style = mentionStyle,
        ellipsizeAt = 8,
    )

    private val plugins = listOf(textPlugin, commandPlugin, mentionPlugin)

    @Test
    fun plainTextPaintsNothing() {
        assertEquals(
            emptyList<TokenPaint>(),
            paintPrompt("hello world", TextRange(0), plugins),
        )
    }

    @Test
    fun aTokenWithMoreWordToComeStillPaintsAsPlainText() {
        // A matcher may stop before the end of a word. Until whitespace or the
        // end of the text follows, the token is still being typed.
        val twoChars = PromptPlugin(
            kind = "pair",
            match = { text, offset ->
                if (text[offset] == '/' && text.length >= offset + 2) {
                    Token(
                        kind = "pair",
                        value = text.substring(offset, offset + 2),
                        start = offset,
                        end = offset + 2,
                    )
                } else {
                    null
                }
            },
            style = commandStyle,
        )

        assertEquals(
            emptyList<TokenPaint>(),
            paintPrompt("/cmd", TextRange(0), listOf(textPlugin, twoChars)),
        )
        assertEquals(
            listOf(TokenPaint(range = TextRange(0, 2), style = commandStyle, replacement = null)),
            paintPrompt("/c md", TextRange(0), listOf(textPlugin, twoChars)),
        )
    }

    @Test
    fun aCompleteTokenPaintsStyledWithoutCollapsing() {
        assertEquals(
            listOf(
                TokenPaint(range = TextRange(0, 4), style = commandStyle, replacement = null),
            ),
            paintPrompt("/cmd foo", TextRange(8), plugins),
        )
    }

    @Test
    fun aTokenTheCaretSitsInsideNeverCollapses() {
        val paints = paintPrompt("see @notes-from-meeting", TextRange(12), plugins)

        assertEquals(1, paints.size)
        assertEquals(mentionStyle, paints.first().style)
        assertNull(paints.first().replacement)
    }

    @Test
    fun aTokenASelectionOverlapsNeverCollapses() {
        val paints = paintPrompt("see @notes-from-meeting", TextRange(0, 6), plugins)

        assertNull(paints.first().replacement)
    }

    @Test
    fun aLongTokenCollapsesWhenTheSelectionIsElsewhere() {
        val paints = paintPrompt("see @notes-from-meeting", TextRange(0), plugins)

        assertEquals(
            listOf(
                TokenPaint(
                    range = TextRange(4, 23),
                    style = mentionStyle,
                    replacement = "@notes-f…",
                ),
            ),
            paints,
        )
    }

    @Test
    fun aTokenShorterThanTheLimitDoesNotCollapse() {
        val paints = paintPrompt("see @notes and more", TextRange(0), plugins)

        assertNull(paints.first().replacement)
    }

    @Test
    fun aPluginWithoutAnEllipsizeLimitNeverCollapses() {
        val paints = paintPrompt("/a-very-long-command-name here", TextRange(30), plugins)

        assertNull(paints.first().replacement)
    }

    @Test
    fun backToBackTokensEachPaint() {
        val paints = paintPrompt("/a @notes-from-meeting", TextRange(0), plugins)

        assertEquals(
            listOf(
                TokenPaint(range = TextRange(0, 2), style = commandStyle, replacement = null),
                TokenPaint(
                    range = TextRange(3, 22),
                    style = mentionStyle,
                    replacement = "@notes-f…",
                ),
            ),
            paints,
        )
    }

    @Test
    fun ellipsizeLeavesShortValuesAlone() {
        assertEquals("@notes", ellipsize("@notes", 8))
        assertEquals("@notes-f", ellipsize("@notes-f", 8))
        assertEquals("@notes-f…", ellipsize("@notes-from", 8))
    }
}
