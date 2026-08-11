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
import server.agent.android.contracts.SessionState
import server.agent.android.ui.theme.AgentServerTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class RenameAndArchiveUiTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun renameSheetContentShowsFields() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                RenameSessionSheetContent(
                    renameState = RenameSessionUiState(name = "Alpha"),
                    onDismiss = {},
                    onNameChanged = {},
                    onSubmit = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("rename_session_sheet").assertIsDisplayed()
        composeTestRule.onNodeWithTag("rename_session_field").assertIsDisplayed()
        composeTestRule.onNodeWithTag("rename_session_submit").assertIsDisplayed()
        composeTestRule.onNodeWithText("Rename session").assertIsDisplayed()
    }

    @Test
    fun archiveConfirmDialogStaysAlertDialog() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        archiveDialogVisible = true,
                        selectedSession = SessionRow(
                            id = "sess_01",
                            name = "Alpha",
                            workspaceId = "ws_01",
                            workspaceLabel = "agent-server",
                            agentId = "cursor",
                            agentLabel = "Cursor",
                            state = SessionState.Idle,
                        ),
                    ),
                    onSessionSelectorClick = {},
                    onWorkspacesClick = {},
                    onDismissPicker = {},
                    onSessionClick = {},
                    onRenameSessionClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onRenameClick = {},
                    onDismissRename = {},
                    onRenameNameChanged = {},
                    onRenameSubmit = {},
                    onArchiveClick = {},
                    onDismissArchive = {},
                    onArchiveSubmit = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("archive_session_dialog").assertIsDisplayed()
        composeTestRule.onNodeWithTag("archive_confirm").assertIsDisplayed()
        composeTestRule.onNodeWithText("Archive session?").assertIsDisplayed()
    }
}
