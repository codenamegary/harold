package harold.android.workspaces

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import harold.android.contracts.Workspace
import harold.android.contracts.WorkspaceState
import org.junit.Assert.assertEquals
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
                    onDeleteWorkspace = {},
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
                    onDeleteWorkspace = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("workspaces_loading").assertIsDisplayed()
    }

    @Test
    fun swipingAWorkspaceConfirmsBeforeDeleting() {
        var deletedId: String? = null
        val workspace = Workspace(
            id = "ws_01",
            name = "harold",
            path = "/tmp/harold",
            state = WorkspaceState.Available,
            createdAt = "2026-08-05T00:00:00.000Z",
            lastUsedAt = "2026-08-05T00:00:00.000Z",
        )
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                WorkspacesScreen(
                    uiState = WorkspacesUiState(
                        loadState = WorkspacesLoadState.Loaded(listOf(workspace)),
                    ),
                    onBack = {},
                    onAddClick = {},
                    onDeleteWorkspace = { deleted -> deletedId = deleted.id },
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
}
