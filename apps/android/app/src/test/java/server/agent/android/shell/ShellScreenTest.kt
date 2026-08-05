package server.agent.android.shell

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.ui.theme.AgentServerTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class ShellScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsAgentServerNotPairedAndPairButton() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ShellScreen(
                    uiState = ShellUiState(),
                    onPairClick = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Agent Server").assertIsDisplayed()
        composeTestRule.onNodeWithText("Not paired").assertIsDisplayed()
        composeTestRule.onNodeWithTag("shell_pair_button").assertIsDisplayed()
    }
}
