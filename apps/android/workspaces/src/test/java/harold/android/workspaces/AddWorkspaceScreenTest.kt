package harold.android.workspaces

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import harold.android.contracts.FilesystemDirectory
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class AddWorkspaceScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val loadedBrowser = BrowserLoadState.Loaded(
        path = "/home/ops/code",
        parent = "/home/ops",
        folders = listOf(FilesystemDirectory(name = "harold", path = "/home/ops/code/harold")),
    )

    @Test
    fun showsIconBackWithoutBackText() {
        setContent(AddWorkspaceUiState())

        composeTestRule.onNodeWithTag("add_workspace_back").assertIsDisplayed()
        composeTestRule.onAllNodesWithText("Back").assertCountEquals(0)
    }

    @Test
    fun openModeShowsTheSharedBrowserAndSelectedFolder() {
        setContent(
            AddWorkspaceUiState(
                mode = AddWorkspaceMode.OpenFolder,
                browserLoadState = loadedBrowser,
                selectedFolderPath = "/home/ops/code",
                name = "code",
            ),
        )

        composeTestRule.onNodeWithTag("add_workspace_mode_open").assertIsDisplayed()
        composeTestRule.onNodeWithTag("add_workspace_browser_path").assertIsDisplayed()
        composeTestRule.onNodeWithTag("add_workspace_selected_folder").assertExists()
        composeTestRule.onNodeWithTag("add_workspace_folder_harold").assertIsDisplayed()
        composeTestRule.onNodeWithTag("add_workspace_use_current").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("add_workspace_submit").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun cloneModeShowsUrlFolderNameAndFinalPath() {
        setContent(
            AddWorkspaceUiState(
                mode = AddWorkspaceMode.CloneRepo,
                browserLoadState = loadedBrowser,
                cloneParent = "/home/ops",
                cloneUrl = "https://github.com/acme/widgets.git",
                cloneFolderName = "widgets",
                name = "widgets",
            ),
        )

        composeTestRule.onNodeWithTag("add_workspace_clone_url").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("add_workspace_clone_folder_name").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("add_workspace_final_path").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("/home/ops/widgets").assertExists()
        composeTestRule.onNodeWithTag("add_workspace_submit").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun newFolderDialogCreatesTheTypedName() {
        var createdName: String? = null
        setContent(
            AddWorkspaceUiState(browserLoadState = loadedBrowser),
            onCreateFolder = { createdName = it },
        )

        composeTestRule.onNodeWithTag("add_workspace_new_folder").performClick()
        composeTestRule.onNodeWithTag("add_workspace_new_folder_name").performTextInput("clones")
        composeTestRule.onNodeWithTag("add_workspace_new_folder_confirm").performClick()

        assertEquals("clones", createdName)
    }

    @Test
    fun submitIsDisabledWithoutASelection() {
        setContent(AddWorkspaceUiState(browserLoadState = loadedBrowser, name = ""))

        composeTestRule.onNodeWithTag("add_workspace_submit").assertIsNotEnabled()
    }

    private fun setContent(
        uiState: AddWorkspaceUiState,
        onCreateFolder: (String) -> Unit = {},
    ) {
        composeTestRule.setContent {
            HaroldTheme {
                AddWorkspaceScreen(
                    uiState = uiState,
                    onBack = {},
                    onModeChanged = {},
                    onNameChanged = {},
                    onFolderSelected = {},
                    onBrowserUp = {},
                    onUseCurrentFolder = {},
                    onFolderQueryChanged = {},
                    onCreateFolder = onCreateFolder,
                    onCloneUrlChanged = {},
                    onCloneFolderNameChanged = {},
                    onSubmit = {},
                )
            }
        }
    }
}
