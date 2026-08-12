package server.agent.android.chat

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import org.junit.Assert.assertEquals
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
class SessionSelectorUiTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val sampleSession = SessionRow(
        id = "sess_01",
        name = "Alpha",
        workspaceId = "ws_01",
        workspaceLabel = "agent-server",
        agentId = "cursor",
        agentLabel = "Cursor",
        state = SessionState.Idle,
    )

    @Test
    fun sessionMenuShowsNewSessionItem() {
        var create = false
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        pickerVisible = true,
                        recentSessions = listOf(sampleSession),
                    ),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = {},
                    onCreateClick = { create = true },
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

        composeTestRule.onNodeWithTag("session_menu").assertIsDisplayed()
        composeTestRule.onNodeWithTag("session_menu_new").assertIsDisplayed().performClick()
        assertTrue(create)
    }

    @Test
    fun sessionMenuRowSelectsSession() {
        var selected: String? = null
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        pickerVisible = true,
                        recentSessions = listOf(sampleSession),
                    ),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = { selected = it.id },
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

        composeTestRule.onNodeWithTag("session_menu_row_sess_01").assertIsDisplayed().performClick()
        assertEquals("sess_01", selected)
    }

    @Test
    fun sessionMenuSeeAllOpensFullList() {
        var seeAll = false
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(pickerVisible = true),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = {},
                    onSeeAllSessionsClick = { seeAll = true },
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

        composeTestRule.onNodeWithTag("session_menu_see_all").assertIsDisplayed().performClick()
        assertTrue(seeAll)
    }

    @Test
    fun sessionsListShowsSearchFabAndRows() {
        var searchValue = ""
        var createClicked = false
        var clickedId: String? = null

        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                SessionsScreen(
                    uiState = ChatUiState(
                        sessionsList = listOf(
                            sampleSession,
                            sampleSession.copy(id = "sess_02", name = "Beta"),
                        ),
                        sessionsListNextCursor = "cursor_more",
                    ),
                    onBack = {},
                    onSearchChanged = { searchValue = it },
                    onSessionClick = { clickedId = it.id },
                    onSessionLongPress = {},
                    onCreateClick = { createClicked = true },
                    onLoadMore = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("sessions_search").assertIsDisplayed().performTextInput("al")
        assertEquals("al", searchValue)
        composeTestRule.onNodeWithTag("sessions_list").assertIsDisplayed()
        composeTestRule.onNodeWithTag("session_row_sess_01").assertIsDisplayed().performClick()
        assertEquals("sess_01", clickedId)
        composeTestRule.onNodeWithTag("sessions_create_fab").assertIsDisplayed().performClick()
        assertTrue(createClicked)
    }

    @Test
    fun sessionsSearchShowsInlineLoadingIndicator() {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                SessionsListContent(
                    uiState = ChatUiState(
                        sessionsList = listOf(sampleSession),
                        sessionsListLoading = true,
                    ),
                    onSearchChanged = {},
                    onSessionClick = {},
                    onSessionLongPress = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("sessions_search_loading").assertIsDisplayed()
        composeTestRule.onNodeWithTag("session_row_sess_01").assertIsDisplayed()
    }
}
