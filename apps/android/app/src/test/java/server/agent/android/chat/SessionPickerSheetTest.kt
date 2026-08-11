package server.agent.android.chat

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
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
class SessionPickerSheetTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsFabForNewSession() {
        var createClicked = false
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                SessionPickerContent(
                    uiState = ChatUiState(
                        sessions = listOf(
                            SessionRow(
                                id = "sess_01",
                                name = "Alpha",
                                workspaceId = "ws_01",
                                workspaceLabel = "agent-server",
                                agentId = "cursor",
                                agentLabel = "Cursor",
                                state = SessionState.Idle,
                            ),
                        ),
                    ),
                    onSessionClick = {},
                    onRenameSessionClick = {},
                    onCreateClick = { createClicked = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("create_session_fab").assertIsDisplayed().performClick()
        assertTrue(createClicked)
    }
}
