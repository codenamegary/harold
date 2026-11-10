package harold.android.chat.auth

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.ui.theme.HaroldTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class AgentAuthUiTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun panelShowsTheHostStatusPlaceholder() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AgentAuthPanel(
                    agentName = "Claude",
                    summary = summary(status = AgentAuthStatus.NeedsAuth),
                    error = null,
                )
            }
        }

        composeTestRule.onNodeWithText("Host login").assertIsDisplayed()
        composeTestRule.onNodeWithTag("agent_auth_manage_on_host").assertIsDisplayed()
    }

    @Test
    fun panelShowsTheSummaryError() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AgentAuthPanel(
                    agentName = "Claude",
                    summary = summary(status = AgentAuthStatus.Error, error = "probe failed"),
                    error = null,
                )
            }
        }

        composeTestRule.onNodeWithTag("agent_auth_summary_error").assertIsDisplayed()
    }

    private fun summary(
        status: AgentAuthStatus,
        error: String? = null,
    ) = AgentAuthSummary(
        status = status,
        error = error,
        activeSessionId = null,
        canLogout = false,
    )
}
