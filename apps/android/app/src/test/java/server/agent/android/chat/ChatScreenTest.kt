package server.agent.android.chat

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.SessionState
import server.agent.android.ui.theme.AgentServerTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class ChatScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsTranscriptAndSubmitsFollowUpPrompt() {
        var submitted = false
        var uiState by mutableStateOf(
            ChatUiState(
                selectedSession = SessionRow(
                    id = "sess_01",
                    name = "Alpha",
                    workspaceId = "ws_01",
                    workspaceLabel = "agent-server",
                    agentId = AgentId.Cursor,
                    agentLabel = "Cursor",
                    state = SessionState.Idle,
                ),
                transcript = TranscriptState(
                    rows = listOf(
                        TranscriptUserRow(
                            turnId = "turn_01",
                            text = "Explain auth",
                        ),
                        TranscriptAssistantRow(
                            turnId = "turn_01",
                            text = "Auth uses bearer tokens.",
                        ),
                    ),
                    sessionState = SessionState.Idle,
                    cursor = 4,
                ),
            ),
        )

        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = uiState,
                    onSessionSelectorClick = {},
                    onWorkspacesClick = {},
                    onDismissPicker = {},
                    onSessionClick = {},
                    onCreateClick = {},
                    onDismissCreate = {},
                    onCreateWorkspaceChanged = {},
                    onCreateAgentChanged = {},
                    onCreatePromptChanged = {},
                    onCreateSubmit = {},
                    onComposerTextChanged = { text ->
                        uiState = uiState.copy(composerText = text)
                    },
                    onComposerSubmit = { submitted = true },
                )
            }
        }

        composeTestRule.onNodeWithText("Explain auth").assertIsDisplayed()
        composeTestRule.onNodeWithText("Auth uses bearer tokens.").assertIsDisplayed()
        composeTestRule.onNodeWithTag("chat_composer")
            .assertIsEnabled()
            .performTextInput("Follow up")
        composeTestRule.onNodeWithTag("chat_send_button").performClick()

        assertTrue(submitted)
        assertTrue(uiState.composerText == "Follow up")
    }

    @Test
    fun disablesComposerWhileSessionRunning() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        selectedSession = SessionRow(
                            id = "sess_01",
                            name = "Alpha",
                            workspaceId = "ws_01",
                            workspaceLabel = "agent-server",
                            agentId = AgentId.Cursor,
                            agentLabel = "Cursor",
                            state = SessionState.Running,
                        ),
                        transcript = TranscriptState(sessionState = SessionState.Running),
                    ),
                    onSessionSelectorClick = {},
                    onWorkspacesClick = {},
                    onDismissPicker = {},
                    onSessionClick = {},
                    onCreateClick = {},
                    onDismissCreate = {},
                    onCreateWorkspaceChanged = {},
                    onCreateAgentChanged = {},
                    onCreatePromptChanged = {},
                    onCreateSubmit = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("chat_composer").assertIsNotEnabled()
        composeTestRule.onNodeWithTag("chat_progress").assertIsDisplayed()
    }
}
