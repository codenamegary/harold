package server.agent.android.chat

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.contracts.SessionState
import server.agent.android.ui.theme.AgentServerTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class DeleteSessionUiTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun closeUnsupportedDialogShowsServerDetail() {
        var dismissed = false
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        deleteUnsupportedMessage = "Agent does not support session/close",
                        selectedSession = SessionRow(
                            sessionId = "sess_01",
                            name = "Alpha",
                            cwd = "/tmp/agent-server",
                            workspaceId = "ws_01",
                            workspaceLabel = "agent-server",
                            agentId = "cursor",
                            agentLabel = "Cursor",
                            state = SessionState.Idle,
                            updatedAt = "2026-08-05T01:00:00.000Z",
                        ),
                    ),
                    onDismissDeleteUnsupported = { dismissed = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("close_unsupported_dialog").assertIsDisplayed()
        composeTestRule.onNodeWithText("Close not supported").assertIsDisplayed()
        composeTestRule.onNodeWithText("Agent does not support session/close").assertIsDisplayed()
        composeTestRule.onNodeWithTag("close_unsupported_confirm").performClick()
        assertTrue(dismissed)
    }
}
