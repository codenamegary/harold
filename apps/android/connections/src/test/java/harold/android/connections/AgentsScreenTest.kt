package harold.android.connections

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.FilesystemDirectory
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class AgentsScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsAgentsAndControls() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AgentsScreen(
                    uiState = AgentsUiState(
                        loading = false,
                        rows = listOf(
                            AgentRow(
                                id = "cursor",
                                displayName = "Cursor",
                                path = "/bin/cursor",
                                args = emptyList(),
                                enabled = true,
                                present = true,
                                popular = true,
                                custom = false,
                                dismissed = false,
                                authStatus = AgentAuthStatus.Authenticated,
                                authError = null,
                                canLogout = false,
                            ),
                            AgentRow(
                                id = "auggie",
                                displayName = "Auggie CLI",
                                path = "/bin/auggie",
                                args = emptyList(),
                                enabled = false,
                                present = false,
                                popular = false,
                                custom = false,
                                dismissed = false,
                                authStatus = AgentAuthStatus.NeedsAuth,
                                authError = null,
                                canLogout = false,
                            ),
                        ),
                    ),
                    onBack = {},
                    onScan = {},
                    onReload = {},
                    onRestart = {},
                    onToggleEnabled = { _, _ -> },
                    onEdit = {},
                    onDelete = {},
                    onRestore = {},
                    onEditDisplayNameChanged = {},
                    onEditPathChanged = {},
                    onEditArgsChanged = {},
                    onEditEnabledChanged = {},
                    onSaveEdit = {},
                    onCancelEdit = {},
                    onStartCreateCustom = {},
                    onCreateNameChanged = {},
                    onCreatePathChanged = {},
                    onCreateArgsChanged = {},
                    onCreateCustom = {},
                    onCancelCreateCustom = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Agents").assertIsDisplayed()
        composeTestRule.onNodeWithTag("agents_search_field").assertIsDisplayed()
        composeTestRule.onNodeWithTag("agents_category_filter").assertIsDisplayed()
        composeTestRule.onNodeWithTag("agent_cursor").assertExists()
        composeTestRule.onNodeWithTag("agent_enabled_cursor").assertExists()
        composeTestRule.onNodeWithTag("agent_auggie").assertExists()
        composeTestRule.onNodeWithText("Installed").assertDoesNotExist()
        composeTestRule.onNodeWithText("Signed in").assertDoesNotExist()
        composeTestRule.onNodeWithText("Enabled").assertDoesNotExist()
    }

    @Test
    fun standardAgentsCannotBeSwipedAway() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AgentsScreen(
                    uiState = AgentsUiState(
                        loading = false,
                        rows = listOf(agentRow(id = "cursor", custom = false)),
                    ),
                    onBack = {},
                    onScan = {},
                    onReload = {},
                    onRestart = {},
                    onToggleEnabled = { _, _ -> },
                    onEdit = {},
                    onDelete = {},
                    onRestore = {},
                    onEditDisplayNameChanged = {},
                    onEditPathChanged = {},
                    onEditArgsChanged = {},
                    onEditEnabledChanged = {},
                    onSaveEdit = {},
                    onCancelEdit = {},
                    onStartCreateCustom = {},
                    onCreateNameChanged = {},
                    onCreatePathChanged = {},
                    onCreateArgsChanged = {},
                    onCreateCustom = {},
                    onCancelCreateCustom = {},
                )
            }
        }

        composeTestRule
            .onNodeWithTag("swipe_delete_cursor")
            .performTouchInput { swipeLeft() }

        composeTestRule.onNodeWithTag("agent_delete_cursor").assertDoesNotExist()
    }

    @Test
    fun customAgentsCanBeSwipedToDeleteAfterConfirmation() {
        var deleted: String? = null
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AgentsScreen(
                    uiState = AgentsUiState(
                        loading = false,
                        rows = listOf(agentRow(id = "custom-claude", custom = true)),
                    ),
                    onBack = {},
                    onScan = {},
                    onReload = {},
                    onRestart = {},
                    onToggleEnabled = { _, _ -> },
                    onEdit = {},
                    onDelete = { deleted = it },
                    onRestore = {},
                    onEditDisplayNameChanged = {},
                    onEditPathChanged = {},
                    onEditArgsChanged = {},
                    onEditEnabledChanged = {},
                    onSaveEdit = {},
                    onCancelEdit = {},
                    onStartCreateCustom = {},
                    onCreateNameChanged = {},
                    onCreatePathChanged = {},
                    onCreateArgsChanged = {},
                    onCreateCustom = {},
                    onCancelCreateCustom = {},
                )
            }
        }

        composeTestRule
            .onNodeWithTag("swipe_delete_custom-claude")
            .performTouchInput { swipeLeft() }
        composeTestRule.onNodeWithTag("agent_delete_custom-claude").performClick()
        composeTestRule.onNodeWithTag("swipe_delete_confirm_action_custom-claude").performClick()

        assertEquals("custom-claude", deleted)
    }

    @Test
    fun enabledCardsHidePathsButKeepTheNodeRuntime() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AgentsScreen(
                    uiState = AgentsUiState(
                        loading = false,
                        rows = listOf(
                            agentRow(
                                id = "pi-acp",
                                custom = false,
                                path = "/custom/pi",
                                binDir = "/home/u/.nvm/versions/node/v22.19.0/bin",
                                binDirVersion = "v22.19.0",
                            ),
                            agentRow(
                                id = "auggie",
                                custom = false,
                                enabled = false,
                                path = "/bin/auggie",
                            ),
                        ),
                    ),
                    onBack = {},
                    onScan = {},
                    onReload = {},
                    onRestart = {},
                    onToggleEnabled = { _, _ -> },
                    onEdit = {},
                    onDelete = {},
                    onRestore = {},
                    onEditDisplayNameChanged = {},
                    onEditPathChanged = {},
                    onEditArgsChanged = {},
                    onEditEnabledChanged = {},
                    onSaveEdit = {},
                    onCancelEdit = {},
                    onStartCreateCustom = {},
                    onCreateNameChanged = {},
                    onCreatePathChanged = {},
                    onCreateArgsChanged = {},
                    onCreateCustom = {},
                    onCancelCreateCustom = {},
                )
            }
        }

        composeTestRule.onNodeWithText("/custom/pi").assertDoesNotExist()
        composeTestRule.onNodeWithText("/home/u/.nvm/versions/node/v22.19.0/bin").assertDoesNotExist()
        composeTestRule.onNodeWithText("Node v22.19.0").assertExists()
        composeTestRule.onNodeWithText("/bin/auggie").assertExists()
    }

    @Test
    fun togglingEnabledCallsCallback() {
        var toggledId: String? = null
        var toggledState: Boolean? = null

        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AgentsScreen(
                    uiState = AgentsUiState(
                        loading = false,
                        rows = listOf(
                            AgentRow(
                                id = "cursor",
                                displayName = "Cursor",
                                path = "/bin/cursor",
                                args = emptyList(),
                                enabled = false,
                                present = true,
                                popular = true,
                                custom = false,
                                dismissed = false,
                                authStatus = AgentAuthStatus.Authenticated,
                                authError = null,
                                canLogout = false,
                            ),
                        ),
                    ),
                    onBack = {},
                    onScan = {},
                    onReload = {},
                    onRestart = {},
                    onToggleEnabled = { id, state ->
                        toggledId = id
                        toggledState = state
                    },
                    onEdit = {},
                    onDelete = {},
                    onRestore = {},
                    onEditDisplayNameChanged = {},
                    onEditPathChanged = {},
                    onEditArgsChanged = {},
                    onEditEnabledChanged = {},
                    onSaveEdit = {},
                    onCancelEdit = {},
                    onStartCreateCustom = {},
                    onCreateNameChanged = {},
                    onCreatePathChanged = {},
                    onCreateArgsChanged = {},
                    onCreateCustom = {},
                    onCancelCreateCustom = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("agent_enabled_cursor").performClick()
        assertEquals("cursor", toggledId)
        assertEquals(true, toggledState)
    }

    @Test
    fun editorShowsTheChosenNodeRuntime() {
        var browseCalls = 0
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AgentsScreen(
                    uiState = AgentsUiState(
                        loading = false,
                        editingAgentId = "pi-acp",
                        editBinDir = "/home/u/.nvm/versions/node/v22.19.0/bin",
                        editBinDirVersion = "v22.19.0",
                        rows = listOf(piRow()),
                    ),
                    onBack = {},
                    onScan = {},
                    onReload = {},
                    onRestart = {},
                    onToggleEnabled = { _, _ -> },
                    onEdit = {},
                    onDelete = {},
                    onRestore = {},
                    onEditDisplayNameChanged = {},
                    onEditPathChanged = {},
                    onEditArgsChanged = {},
                    onEditEnabledChanged = {},
                    onSaveEdit = {},
                    onCancelEdit = {},
                    onStartCreateCustom = {},
                    onCreateNameChanged = {},
                    onCreatePathChanged = {},
                    onCreateArgsChanged = {},
                    onCreateCustom = {},
                    onCancelCreateCustom = {},
                    onEditBinDirBrowse = { browseCalls += 1 },
                )
            }
        }

        composeTestRule.onNodeWithTag("agent_edit_bin_dir").assertExists()
        composeTestRule.onNodeWithTag("agent_edit_bin_dir_version").assertExists()
        composeTestRule.onNodeWithText("Node v22.19.0").assertExists()
        composeTestRule.onNodeWithTag("agent_edit_bin_dir_browse").performScrollTo().performClick()
        assertEquals(1, browseCalls)
    }

    @Test
    fun runtimePickerShowsFoldersAndCanUseTheCurrentOne() {
        var used = false
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AgentsScreen(
                    uiState = AgentsUiState(
                        loading = false,
                        editingAgentId = "pi-acp",
                        rows = listOf(piRow()),
                        binDirPicker = BinDirPickerUiState(
                            open = true,
                            target = BinDirTarget.Edit,
                            path = "/home/u",
                            folders = listOf(
                                FilesystemDirectory(name = ".nvm", path = "/home/u/.nvm"),
                            ),
                        ),
                    ),
                    onBack = {},
                    onScan = {},
                    onReload = {},
                    onRestart = {},
                    onToggleEnabled = { _, _ -> },
                    onEdit = {},
                    onDelete = {},
                    onRestore = {},
                    onEditDisplayNameChanged = {},
                    onEditPathChanged = {},
                    onEditArgsChanged = {},
                    onEditEnabledChanged = {},
                    onSaveEdit = {},
                    onCancelEdit = {},
                    onStartCreateCustom = {},
                    onCreateNameChanged = {},
                    onCreatePathChanged = {},
                    onCreateArgsChanged = {},
                    onCreateCustom = {},
                    onCancelCreateCustom = {},
                    onBinDirUseCurrent = { used = true },
                )
            }
        }

        composeTestRule.onNodeWithTag("agent_bin_dir_folder_list").assertExists()
        composeTestRule.onNodeWithTag("agent_bin_dir_folder_.nvm").assertExists()
        composeTestRule.onNodeWithTag("agent_bin_dir_use_current").performClick()
        assertTrue(used)
    }

    @Test
    fun filterByCategoryHidesNonMatching() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                AgentsScreen(
                    uiState = AgentsUiState(
                        loading = false,
                        selectedCategory = AgentCategory.Enabled,
                        rows = listOf(
                            AgentRow(
                                id = "cursor",
                                displayName = "Cursor",
                                path = "/bin/cursor",
                                args = emptyList(),
                                enabled = true,
                                present = true,
                                popular = true,
                                custom = false,
                                dismissed = false,
                                authStatus = AgentAuthStatus.Authenticated,
                                authError = null,
                                canLogout = false,
                            ),
                            AgentRow(
                                id = "auggie",
                                displayName = "Auggie CLI",
                                path = "/bin/auggie",
                                args = emptyList(),
                                enabled = false,
                                present = false,
                                popular = false,
                                custom = false,
                                dismissed = false,
                                authStatus = AgentAuthStatus.NeedsAuth,
                                authError = null,
                                canLogout = false,
                            ),
                        ),
                    ),
                    onBack = {},
                    onScan = {},
                    onReload = {},
                    onRestart = {},
                    onToggleEnabled = { _, _ -> },
                    onEdit = {},
                    onDelete = {},
                    onRestore = {},
                    onEditDisplayNameChanged = {},
                    onEditPathChanged = {},
                    onEditArgsChanged = {},
                    onEditEnabledChanged = {},
                    onSaveEdit = {},
                    onCancelEdit = {},
                    onStartCreateCustom = {},
                    onCreateNameChanged = {},
                    onCreatePathChanged = {},
                    onCreateArgsChanged = {},
                    onCreateCustom = {},
                    onCancelCreateCustom = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("agent_cursor").assertIsDisplayed()
        composeTestRule.onNodeWithTag("agent_auggie").assertDoesNotExist()
    }

    private fun agentRow(
        id: String,
        custom: Boolean,
        enabled: Boolean = true,
        path: String? = "/bin/$id",
        binDir: String? = null,
        binDirVersion: String? = null,
    ) = AgentRow(
        id = id,
        displayName = "Agent $id",
        path = path,
        args = emptyList(),
        binDir = binDir,
        binDirVersion = binDirVersion,
        enabled = enabled,
        present = true,
        popular = false,
        custom = custom,
        dismissed = false,
        authStatus = AgentAuthStatus.Unknown,
        authError = null,
        canLogout = false,
    )

    private fun piRow() = AgentRow(
        id = "pi-acp",
        displayName = "pi ACP",
        path = null,
        args = listOf("-y", "pi-acp@0.0.34"),
        binDir = "/home/u/.nvm/versions/node/v22.19.0/bin",
        binDirVersion = "v22.19.0",
        requiredNodeMajor = 22,
        enabled = true,
        present = false,
        popular = true,
        custom = false,
        dismissed = false,
        authStatus = AgentAuthStatus.Unknown,
        authError = null,
        canLogout = false,
    )
}
