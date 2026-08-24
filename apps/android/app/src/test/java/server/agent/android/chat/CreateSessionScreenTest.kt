package server.agent.android.chat

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
class CreateSessionScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsWorkspaceAgentAndContinueWithoutInitialPrompt() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                CreateSessionScreen(
                    createState = CreateSessionUiState(
                        workspaces = listOf(
                            WorkspaceRow(
                                id = "ws_01",
                                name = "agent-server",
                                path = "/tmp/agent-server",
                                state = server.agent.android.contracts.WorkspaceState.Available,
                            ),
                        ),
                        selectedWorkspaceId = "ws_01",
                        agents = listOf(
                            AgentOption(id = "cursor", displayName = "Cursor"),
                        ),
                        selectedAgentId = "cursor",
                    ),
                    onBack = {},
                    onWorkspaceChanged = {},
                    onAgentChanged = {},
                    onSubmit = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("create_session_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("create_session_back").assertIsDisplayed()
        composeTestRule.onNodeWithTag("create_session_submit").assertIsDisplayed()
        composeTestRule.onNodeWithTag("create_session_workspace").assertIsDisplayed()
        composeTestRule.onNodeWithTag("create_session_agent").assertIsDisplayed()
        composeTestRule.onNodeWithTag("create_session_helper").assertIsDisplayed()
        composeTestRule.onNodeWithText("New session").assertIsDisplayed()
        composeTestRule.onNodeWithText("Continue").assertIsDisplayed()
    }
}
