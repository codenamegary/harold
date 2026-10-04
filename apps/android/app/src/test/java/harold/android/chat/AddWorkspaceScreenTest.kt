package harold.android.chat

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import harold.android.contracts.FilesystemDirectory
import harold.android.ui.theme.HaroldTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class AddWorkspaceScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsIconBackWithoutBackText() {
        composeTestRule.setContent {
            HaroldTheme {
                AddWorkspaceScreen(
                    uiState = AddWorkspaceUiState(rootsLoadState = RootsLoadState.Empty),
                    onBack = {},
                    onNameChanged = {},
                    onRootChanged = {},
                    onFolderChanged = {},
                    onFolderQueryChanged = {},
                    onSubmit = {},
                    onCreated = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("add_workspace_back").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("Back").assertCountEquals(0)
    }

    @Test
    fun showsEmptyRootsMessageAndDisablesSubmit() {
        composeTestRule.setContent {
            HaroldTheme {
                AddWorkspaceScreen(
                    uiState = AddWorkspaceUiState(rootsLoadState = RootsLoadState.Empty),
                    onBack = {},
                    onNameChanged = {},
                    onRootChanged = {},
                    onFolderChanged = {},
                    onFolderQueryChanged = {},
                    onSubmit = {},
                    onCreated = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("add_workspace_no_roots").assertIsDisplayed()
        composeTestRule.onNodeWithTag("add_workspace_submit").assertIsNotEnabled()
    }

    @Test
    fun showsSearchableFoldersAfterRootLoaded() {
        composeTestRule.setContent {
            HaroldTheme {
                AddWorkspaceScreen(
                    uiState = AddWorkspaceUiState(
                        selectedRoot = "/home/ops/code",
                        rootsLoadState = RootsLoadState.Loaded(listOf("/home/ops/code")),
                        foldersLoadState = FoldersLoadState.Loaded(
                            listOf(
                                FilesystemDirectory(
                                    name = "harold",
                                    path = "/home/ops/code/harold",
                                ),
                            ),
                        ),
                    ),
                    onBack = {},
                    onNameChanged = {},
                    onRootChanged = {},
                    onFolderChanged = {},
                    onFolderQueryChanged = {},
                    onSubmit = {},
                    onCreated = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("add_workspace_folder_search").assertIsDisplayed()
        composeTestRule.onNodeWithTag("add_workspace_folder_harold").assertIsDisplayed()
        composeTestRule.onNodeWithText("harold").assertIsDisplayed()
    }
}
