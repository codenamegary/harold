package server.agent.android.chat

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.ui.theme.AgentServerTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class MarkdownMessageComposeTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun paintsCompletedTextOnTheFirstFrame() {
        composeTestRule.mainClock.autoAdvance = false

        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                MarkdownMessage(text = "Added.")
            }
        }

        composeTestRule.onNodeWithText("Added.").assertIsDisplayed()
    }
}
