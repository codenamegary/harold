package harold.android.chat

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
    fun workspaceFieldShowsTheDisambiguatedSelectedLabel() {
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
                        selectedWorkspaceId = "saved-other",
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

        composeTestRule.onNodeWithText("harold (other)").assertIsDisplayed()
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
    }

    @Test
    fun workspaceDropdownOffersAllWorkspaces() {
        var allWorkspacesClicked = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                CreateSessionScreen(
                    createState = CreateSessionUiState(
                        workspaces = listOf(
                            WorkspaceRow(
                                id = "ws_01",
                                name = "harold",
                                path = "/tmp/harold",
                                state = WorkspaceState.Available,
                            ),
                            WorkspaceRow(
                                id = "ws_02",
                                name = "notes",
                                path = "/tmp/notes",
                                state = WorkspaceState.Available,
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
                    onAllWorkspacesClick = { allWorkspacesClicked = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("create_session_workspace").performClick()
        composeTestRule.onNodeWithTag("create_session_all_workspaces").performClick()

        assertTrue(allWorkspacesClicked)
    }

    @Test
    fun workspaceDropdownShowsOnlyTheFiveMostRecentWorkspaces() {
        val workspaces = (1..6).map { index ->
            WorkspaceRow(
                id = "ws_$index",
                name = "workspace-$index",
                path = "/tmp/workspace-$index",
                state = WorkspaceState.Available,
            )
        }
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                CreateSessionScreen(
                    createState = CreateSessionUiState(
                        workspaces = workspaces,
                        selectedWorkspaceId = "ws_1",
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

        composeTestRule.onNodeWithTag("create_session_workspace").performClick()

        (1..5).forEach { index ->
            composeTestRule
                .onNodeWithTag("create_session_workspace_option_ws_$index")
                .assertExists()
        }
        composeTestRule
            .onNodeWithTag("create_session_workspace_option_ws_6")
            .assertDoesNotExist()
        composeTestRule.onNodeWithTag("create_session_all_workspaces").assertExists()
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
