package harold.android.workspaces

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import harold.android.ui.theme.HaroldTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class WorkspacesScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsIconBackWithoutBackText() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                WorkspacesScreen(
                    uiState = WorkspacesUiState(loadState = WorkspacesLoadState.Empty),
                    onBack = {},
                    onAddClick = {},
                    onNewSession = {},
                    onDeleteWorkspace = {},
                    onShowCleanupConfirm = {},
                    onHideCleanupConfirm = {},
                    onCleanupMissing = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("workspaces_back").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("Back").assertCountEquals(0)
    }

    @Test
    fun emptyCacheShowsSkeletonRowsWhileLoading() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                WorkspacesScreen(
                    uiState = WorkspacesUiState(loadState = WorkspacesLoadState.Loading),
                    onBack = {},
                    onAddClick = {},
                    onNewSession = {},
                    onDeleteWorkspace = {},
                    onShowCleanupConfirm = {},
                    onHideCleanupConfirm = {},
                    onCleanupMissing = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("workspaces_loading").assertIsDisplayed()
    }

    @Test
    fun swipingAWorkspaceConfirmsBeforeDeleting() {
        var deletedId: String? = null
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                WorkspacesScreen(
                    uiState = WorkspacesUiState(
                        loadState = WorkspacesLoadState.Loaded(listOf(screenWorkspace())),
                    ),
                    onBack = {},
                    onAddClick = {},
                    onNewSession = {},
                    onDeleteWorkspace = { deleted -> deletedId = deleted.id },
                    onShowCleanupConfirm = {},
                    onHideCleanupConfirm = {},
                    onCleanupMissing = {},
                )
            }
        }

        composeTestRule
            .onNodeWithTag("swipe_delete_ws_01")
            .performTouchInput { swipeLeft() }
        composeTestRule.onNodeWithTag("workspace_delete_ws_01").performClick()

        composeTestRule.onNodeWithText("Delete workspace?").assertIsDisplayed()
        composeTestRule
            .onNodeWithText(
                "This removes the workspace from this connection. " +
                    "The folder and its files stay on the host.",
            )
            .assertIsDisplayed()

        composeTestRule.onNodeWithTag("swipe_delete_confirm_action_ws_01").performClick()

        assertEquals("ws_01", deletedId)
    }

    @Test
    fun newSessionIconOpensTheWorkspace() {
        var startedWorkspace: Workspace? = null
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                WorkspacesScreen(
                    uiState = WorkspacesUiState(
                        loadState = WorkspacesLoadState.Loaded(listOf(screenWorkspace())),
                    ),
                    onBack = {},
                    onAddClick = {},
                    onNewSession = { startedWorkspace = it },
                    onDeleteWorkspace = {},
                    onShowCleanupConfirm = {},
                    onHideCleanupConfirm = {},
                    onCleanupMissing = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("workspace_new_session_ws_01").performClick()

        assertEquals("ws_01", startedWorkspace?.id)
    }

    @Test
    fun cleanupMenuHiddenWhenNoWorkspaceIsMissing() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                WorkspacesScreen(
                    uiState = WorkspacesUiState(
                        loadState = WorkspacesLoadState.Loaded(listOf(screenWorkspace())),
                    ),
                    onBack = {},
                    onAddClick = {},
                    onNewSession = {},
                    onDeleteWorkspace = {},
                    onShowCleanupConfirm = {},
                    onHideCleanupConfirm = {},
                    onCleanupMissing = {},
                )
            }
        }

        composeTestRule.onAllNodesWithTag("workspaces_overflow").assertCountEquals(0)
    }

    @Test
    fun cleanupMenuOpensWhenAWorkspaceIsMissing() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                WorkspacesScreen(
                    uiState = WorkspacesUiState(
                        loadState = WorkspacesLoadState.Loaded(
                            listOf(
                                screenWorkspace(),
                                screenWorkspace(id = "ws_gone", state = WorkspaceState.Missing),
                            ),
                        ),
                    ),
                    onBack = {},
                    onAddClick = {},
                    onNewSession = {},
                    onDeleteWorkspace = {},
                    onShowCleanupConfirm = {},
                    onHideCleanupConfirm = {},
                    onCleanupMissing = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("workspaces_overflow").performClick()

        composeTestRule
            .onNodeWithTag("workspaces_overflow_menu")
            .assertIsDisplayed()
        composeTestRule.onNodeWithText("Clean up missing").assertIsDisplayed()
    }

    @Test
    fun cleanupMenuItemAsksForConfirmation() {
        var cleanupRequested = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                WorkspacesScreen(
                    uiState = WorkspacesUiState(
                        loadState = WorkspacesLoadState.Loaded(
                            listOf(screenWorkspace(id = "ws_gone", state = WorkspaceState.Missing)),
                        ),
                    ),
                    onBack = {},
                    onAddClick = {},
                    onNewSession = {},
                    onDeleteWorkspace = {},
                    onShowCleanupConfirm = { cleanupRequested = true },
                    onHideCleanupConfirm = {},
                    onCleanupMissing = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("workspaces_overflow").performClick()
        composeTestRule.onNodeWithTag("workspaces_cleanup_menu_item").performClick()

        assertTrue(cleanupRequested)
    }

    @Test
    fun cleanupDialogConfirmsBeforeCleaning() {
        var cleanupRequested = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                WorkspacesScreen(
                    uiState = WorkspacesUiState(
                        loadState = WorkspacesLoadState.Loaded(
                            listOf(screenWorkspace(id = "ws_gone", state = WorkspaceState.Missing)),
                        ),
                        cleanupConfirmVisible = true,
                    ),
                    onBack = {},
                    onAddClick = {},
                    onNewSession = {},
                    onDeleteWorkspace = {},
                    onShowCleanupConfirm = {},
                    onHideCleanupConfirm = {},
                    onCleanupMissing = { cleanupRequested = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("workspaces_cleanup_dialog").assertIsDisplayed()
        composeTestRule.onNodeWithText("Clean up missing workspaces?").assertIsDisplayed()

        composeTestRule.onNodeWithTag("workspaces_cleanup_confirm").performClick()

        assertTrue(cleanupRequested)
    }

    @Test
    fun cleanupDialogCancelDismissesWithoutCleaning() {
        var cleanupRequested = false
        var dialogDismissed = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                WorkspacesScreen(
                    uiState = WorkspacesUiState(
                        loadState = WorkspacesLoadState.Loaded(
                            listOf(screenWorkspace(id = "ws_gone", state = WorkspaceState.Missing)),
                        ),
                        cleanupConfirmVisible = true,
                    ),
                    onBack = {},
                    onAddClick = {},
                    onNewSession = {},
                    onDeleteWorkspace = {},
                    onShowCleanupConfirm = {},
                    onHideCleanupConfirm = { dialogDismissed = true },
                    onCleanupMissing = { cleanupRequested = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("workspaces_cleanup_cancel").performClick()

        assertTrue(dialogDismissed)
        assertTrue(!cleanupRequested)
    }

    private fun screenWorkspace(
        id: String = "ws_01",
        state: WorkspaceState = WorkspaceState.Available,
    ) = Workspace(
        id = id,
        name = "harold",
        path = "/tmp/harold",
        state = state,
        createdAt = "2026-08-05T00:00:00.000Z",
        lastUsedAt = "2026-08-05T00:00:00.000Z",
    )
}
