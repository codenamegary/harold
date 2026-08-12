package server.agent.android.chat

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
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
class RenameAndArchiveUiTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun sessionEditDialogShowsNameSaveCancelArchive() {
        var archived = false
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                SessionEditDialog(
                    renameState = RenameSessionUiState(sessionId = "sess_01", name = "Alpha"),
                    archiveSubmitting = false,
                    onDismiss = {},
                    onNameChanged = {},
                    onSave = {},
                    onArchive = { archived = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("session_edit_dialog").assertIsDisplayed()
        composeTestRule.onNodeWithTag("session_edit_name").assertIsDisplayed()
        composeTestRule.onNodeWithTag("session_edit_save").assertIsDisplayed()
        composeTestRule.onNodeWithTag("session_edit_cancel").assertIsDisplayed()
        composeTestRule.onNodeWithTag("session_edit_archive").assertIsDisplayed().performClick()
        assertTrue(archived)
    }

    @Test
    fun sessionEditSaveDisabledWhenNameBlank() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                SessionEditDialog(
                    renameState = RenameSessionUiState(sessionId = "sess_01", name = "   "),
                    archiveSubmitting = false,
                    onDismiss = {},
                    onNameChanged = {},
                    onSave = {},
                    onArchive = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("session_edit_save").assertIsNotEnabled()
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
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
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
