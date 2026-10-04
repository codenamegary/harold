package harold.android.ui.promptinput

import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.input.setTextAndPlaceCursorAtEnd
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextRange
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import harold.android.ui.theme.HaroldTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class PromptInputTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val plugins = listOf(
        PromptPlugin(kind = "text"),
        PromptPlugin(
            kind = "mention",
            match = matchTrigger("@", "mention"),
            style = SpanStyle(color = Color.Magenta),
            ellipsizeAt = 8,
        ),
    )

    private fun setContent(state: TextFieldState) {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                PromptInput(
                    state = state,
                    plugins = plugins,
                    placeholder = "Ask anything",
                    modifier = Modifier.testTag("prompt_input"),
                )
            }
        }
    }

    @Test
    fun showsThePlaceholderUntilTextArrives() {
        val state = TextFieldState()
        setContent(state)

        composeTestRule.onNodeWithText("Ask anything").assertIsDisplayed()
        composeTestRule.onNodeWithTag("prompt_input").performTextInput("hi")

        assertEquals("hi", state.text.toString())
        composeTestRule.onNodeWithText("Ask anything").assertDoesNotExist()
    }

    @Test
    fun collapsesALongTokenWhenTheCaretMovesAway() {
        val state = TextFieldState()
        setContent(state)

        state.setTextAndPlaceCursorAtEnd("see @notes-from-meeting")
        composeTestRule.waitForIdle()
        assertEquals("see @notes-from-meeting", renderedText())

        state.edit { selection = TextRange(0) }
        composeTestRule.waitForIdle()
        assertEquals("see @notes-f…", renderedText())

        state.edit { selection = TextRange(12) }
        composeTestRule.waitForIdle()
        assertEquals("see @notes-from-meeting", renderedText())
    }

    @Test
    fun keepsTheStoredTextWhileTheRenderedTextCollapses() {
        val state = TextFieldState()
        setContent(state)

        state.setTextAndPlaceCursorAtEnd("see @notes-from-meeting and more")
        state.edit { selection = TextRange(0) }
        composeTestRule.waitForIdle()

        assertEquals("see @notes-from-meeting and more", state.text.toString())
        assertEquals("see @notes-f… and more", renderedText())
    }

    @Test
    fun typingPastACollapsedTokenEditsTheStoredText() {
        val state = TextFieldState()
        setContent(state)

        state.setTextAndPlaceCursorAtEnd("see @notes-from-meeting and ")
        state.edit { selection = TextRange(0) }
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("prompt_input").performTextInput("x")

        assertEquals("xsee @notes-from-meeting and ", state.text.toString())
    }

    private fun renderedText(): String =
        composeTestRule.onNodeWithTag("prompt_input")
            .fetchSemanticsNode()
            .config
            .first { entry -> entry.key.name == "EditableText" }
            .value
            .toString()
}
