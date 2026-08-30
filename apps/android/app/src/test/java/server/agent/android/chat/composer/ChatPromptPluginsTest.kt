package server.agent.android.chat.composer

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextRange
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import server.agent.android.ui.promptinput.TokenPaint
import server.agent.android.ui.promptinput.paintPrompt
import server.agent.android.ui.promptinput.scanTokens

class ChatPromptPluginsTest {
    private val commandStyle = commandSpanStyle(Color.Green)
    private val plugins = chatPromptPlugins(commandStyle)

    @Test
    fun splitsCommandsOutOfPlainText() {
        val kinds = scanTokens("draft /plan now", plugins).map { token -> token.kind }

        assertEquals(
            listOf(ChatTokenKind.TEXT, ChatTokenKind.COMMAND, ChatTokenKind.TEXT),
            kinds,
        )
    }

    @Test
    fun paintsACompletedCommandWithTheGivenStyle() {
        assertEquals(
            listOf(
                TokenPaint(range = TextRange(6, 11), style = commandStyle, replacement = null),
            ),
            paintPrompt("draft /plan now", TextRange(0), plugins),
        )
    }

    @Test
    fun leavesAPathAlone() {
        assertEquals(
            emptyList<TokenPaint>(),
            paintPrompt("open src/main/App.kt", TextRange(0), plugins),
        )
    }

    @Test
    fun commandsNeverCollapse() {
        val paints = paintPrompt("/a-very-long-command-name here", TextRange(0), plugins)

        assertNull(paints.single().replacement)
    }
}
