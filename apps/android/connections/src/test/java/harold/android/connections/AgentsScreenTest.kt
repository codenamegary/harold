package harold.android.connections

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import harold.android.contracts.AgentAuthStatus
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
}
