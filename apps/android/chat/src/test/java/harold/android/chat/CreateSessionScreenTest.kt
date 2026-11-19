package harold.android.chat

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import harold.android.contracts.WorkspaceState
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import harold.android.ui.theme.HaroldTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class CreateSessionScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsWorkspaceAgentAndStartSessionWithoutInitialPrompt() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                CreateSessionScreen(
                    createState = CreateSessionUiState(
                        workspaces = listOf(
                            WorkspaceRow(
                                id = "ws_01",
                                name = "harold",
                                path = "/tmp/harold",
                                state = harold.android.contracts.WorkspaceState.Available,
                            ),
                        ),
                        selectedWorkspaceId = "ws_01",
                        agents = listOf(
                            AgentOption(id = "cursor", displayName = "Cursor"),
                        ),
                        selectedAgentId = "cursor",
                    ),
                    onBack = {},
                    onWorkspaceChanged = {},
                    onAgentChanged = {},
                    onSubmit = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("create_session_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("create_session_back").assertIsDisplayed()
        composeTestRule.onNodeWithTag("create_session_submit").assertIsDisplayed()
        composeTestRule.onNodeWithTag("create_session_workspace").assertIsDisplayed()
        composeTestRule.onNodeWithTag("create_session_agent").assertIsDisplayed()
        composeTestRule.onNodeWithTag("create_session_helper").assertDoesNotExist()
        composeTestRule.onNodeWithText("New session").assertIsDisplayed()
        composeTestRule.onNodeWithText("Start Session").assertIsDisplayed()
    }

    @Test
    fun workspaceFieldShowsTheHaroldNameColorAndIcon() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                CreateSessionScreen(
                    createState = CreateSessionUiState(
                        workspaces = listOf(
                            WorkspaceRow(
                                id = "http://laptop.local:3847|ws_01",
                                name = "notes",
                                path = "/tmp/notes",
                                state = harold.android.contracts.WorkspaceState.Available,
                                connectionId = "http://laptop.local:3847",
                                connectionName = "laptop",
                                connectionColorId = "tide",
                                connectionIconId = "bolt",
                            ),
                        ),
                        selectedWorkspaceId = "http://laptop.local:3847|ws_01",
                        agents = listOf(AgentOption(id = "cursor", displayName = "Cursor")),
                        selectedAgentId = "cursor",
                    ),
                    onBack = {},
                    onWorkspaceChanged = {},
                    onAgentChanged = {},
                    onSubmit = {},
                )
            }
        }

        composeTestRule.onNodeWithText("notes").assertIsDisplayed()
        composeTestRule.onNodeWithTag("create_session_workspace_badge", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun workspaceDropdownShowsNewWorkspaceOption() {
        var newWorkspaceClicked = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                CreateSessionScreen(
                    createState = CreateSessionUiState(
                        workspaces = listOf(
                            WorkspaceRow(
                                id = "ws_01",
                                name = "harold",
                                path = "/tmp/harold",
                                state = harold.android.contracts.WorkspaceState.Available,
                            ),
                        ),
                        selectedWorkspaceId = "ws_01",
                        agents = listOf(AgentOption(id = "cursor", displayName = "Cursor")),
                        selectedAgentId = "cursor",
                    ),
                    onBack = {},
                    onWorkspaceChanged = {},
                    onAgentChanged = {},
                    onSubmit = {},
                    onNewWorkspaceClick = { newWorkspaceClicked = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("create_session_workspace").performClick()
        composeTestRule.onNodeWithTag("create_session_new_workspace").assertIsDisplayed().performClick()
        assertTrue(newWorkspaceClicked)
    }

    @Test
    fun workspaceDropdownDisambiguatesDuplicateHaroldFolders() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                CreateSessionScreen(
                    createState = CreateSessionUiState(
                        workspaces = listOf(
                            WorkspaceRow(
                                id = "saved",
                                name = "harold",
                                path = "/home/u/sites/harold",
                                state = WorkspaceState.Available,
                            ),
                            WorkspaceRow(
                                id = "saved-other",
                                name = "harold",
                                path = "/home/u/other/harold",
                                state = WorkspaceState.Available,
                            ),
                        ),
                        recentSessionFolders = listOf(
                            WorkspaceRow(
                                id = "session",
                                name = "harold",
                                path = "/home/u/harold-demo-workspaces/3847/harold",
                                state = WorkspaceState.Available,
                                source = WorkspaceSource.SessionFolder,
                            ),
                        ),
                        recentSessionFoldersExpanded = true,
                        agents = listOf(AgentOption(id = "cursor", displayName = "Cursor")),
                    ),
                    onBack = {},
                    onWorkspaceChanged = {},
                    onAgentChanged = {},
                    onSubmit = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("create_session_workspace").performClick()

        composeTestRule.onNodeWithText("harold (sites)").assertIsDisplayed()
        composeTestRule.onNodeWithText("harold (other)").assertIsDisplayed()
        composeTestRule.onNodeWithText("harold (harold-demo-workspaces)")
            .performScrollTo()
            .assertIsDisplayed()
    }

    @Test
    fun openingRecentSessionFoldersShowsAHintWithItsBadgeAndFullPath() {
        val expanded = mutableStateOf(false)
        val hint = WorkspaceRow(
            id = "session:http://laptop.local:3847|session:/home/u/demo/harold",
            name = "harold",
            path = "/home/u/harold-demo-workspaces/3847/harold",
            state = WorkspaceState.Available,
            connectionId = "http://laptop.local:3847",
            connectionName = "laptop",
            source = WorkspaceSource.SessionFolder,
        )
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                CreateSessionScreen(
                    createState = CreateSessionUiState(
                        workspaces = listOf(
                            WorkspaceRow(
                                id = "saved",
                                name = "notes",
                                path = "/home/u/sites/notes",
                                state = WorkspaceState.Available,
                            ),
                        ),
                        selectedWorkspaceId = "saved",
                        agents = listOf(AgentOption(id = "cursor", displayName = "Cursor")),
                        selectedAgentId = "cursor",
                        recentSessionFolders = listOf(hint),
                        recentSessionFoldersExpanded = expanded.value,
                    ),
                    onBack = {},
                    onWorkspaceChanged = {},
                    onAgentChanged = {},
                    onSubmit = {},
                    onRecentSessionFoldersToggle = { expanded.value = !expanded.value },
                )
            }
        }

        composeTestRule.onNodeWithTag("create_session_workspace").performClick()
        composeTestRule.onNodeWithTag("create_session_recent_folders").assertIsDisplayed().performClick()

        composeTestRule.onNodeWithText("Recent session folders").assertIsDisplayed()
        composeTestRule.onNodeWithText("session folder", useUnmergedTree = true).assertIsDisplayed()
        composeTestRule.onNodeWithText(hint.path, useUnmergedTree = true).assertIsDisplayed()
        composeTestRule
            .onNodeWithTag("create_session_session_folder_badge_${hint.id}", useUnmergedTree = true)
            .assertIsDisplayed()
    }

    @Test
    fun workspaceNoticeIsShownBelowTheWorkspaceField() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                CreateSessionScreen(
                    createState = CreateSessionUiState(
                        workspaces = listOf(
                            WorkspaceRow(
                                id = "saved",
                                name = "harold",
                                path = "/home/u/sites/harold",
                                state = WorkspaceState.Available,
                            ),
                        ),
                        agents = listOf(AgentOption(id = "cursor", displayName = "Cursor")),
                        notice = CreateSessionNotice.RememberedWorkspaceMissing,
                    ),
                    onBack = {},
                    onWorkspaceChanged = {},
                    onAgentChanged = {},
                    onSubmit = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("create_session_notice").assertIsDisplayed()
        composeTestRule
            .onNodeWithText("Your last workspace is no longer saved. Choose a workspace.")
            .assertIsDisplayed()
    }
}
