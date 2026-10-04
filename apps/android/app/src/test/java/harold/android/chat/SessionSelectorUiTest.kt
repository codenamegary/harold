package harold.android.chat

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
import harold.android.contracts.SessionState
import harold.android.ui.theme.HaroldTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class SessionSelectorUiTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val sampleSession = SessionRow(
        sessionId = "sess_01",
        name = "Alpha",
        cwd = "/tmp/harold",
        workspaceId = "ws_01",
        workspaceLabel = "harold",
        agentId = "cursor",
        agentLabel = "Cursor",
        state = SessionState.Idle,
        updatedAt = "2026-08-05T01:00:00.000Z",
    )

    @Test
    fun sessionMenuShowsNewSessionItem() {
        var create = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
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
            HaroldTheme(dynamicColor = false) {
                ChatScreen(
                    uiState = ChatUiState(
                        pickerVisible = true,
                        recentSessions = listOf(sampleSession),
                    ),
                    onSessionSelectorClick = {},
                    onDismissSessionMenu = {},
                    onWorkspacesClick = {},
                    onSessionClick = { selected = it.sessionId },
                    onSeeAllSessionsClick = {},
                    onCreateClick = {},
                    onComposerTextChanged = {},
                    onComposerSubmit = {},
                    onComposerCancel = {},
                    onPermissionOptionSelect = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("session_menu_row_cursor:sess_01").assertIsDisplayed().performClick()
        assertEquals("sess_01", selected)
    }

    @Test
    fun sessionMenuSeeAllOpensFullList() {
        var seeAll = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
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
            HaroldTheme(dynamicColor = false) {
                SessionsScreen(
                    uiState = ChatUiState(
                        sessionsList = listOf(
                            sampleSession,
                            sampleSession.copy(sessionId = "sess_02", name = "Beta"),
                        ),
                        
                    ),
                    onBack = {},
                    onSearchChanged = { searchValue = it },
                    onSessionClick = { clickedId = it.sessionId },
                    onDeleteSession = {},
                    onCreateClick = { createClicked = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("sessions_search").assertIsDisplayed().performTextInput("al")
        assertEquals("al", searchValue)
        composeTestRule.onNodeWithTag("sessions_list").assertIsDisplayed()
        composeTestRule.onNodeWithTag("session_row_cursor:sess_01").assertIsDisplayed().performClick()
        assertEquals("sess_01", clickedId)
        composeTestRule.onNodeWithTag("sessions_create_fab").assertIsDisplayed().performClick()
        assertTrue(createClicked)
    }

    @Test
    fun sessionsSearchShowsInlineLoadingIndicator() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SessionsListContent(
                    uiState = ChatUiState(
                        sessionsList = listOf(sampleSession),
                        sessionsListLoading = true,
                    ),
                    onSearchChanged = {},
                    onSessionClick = {},
                    onDeleteSession = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("sessions_search_loading").assertIsDisplayed()
        composeTestRule.onNodeWithTag("session_row_cursor:sess_01").assertIsDisplayed()
    }
}
