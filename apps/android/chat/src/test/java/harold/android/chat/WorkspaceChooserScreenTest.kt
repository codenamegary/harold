package harold.android.chat

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import harold.android.contracts.WorkspaceState
import harold.android.ui.theme.HaroldTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class WorkspaceChooserScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val notes = WorkspaceRow(
        id = "http://laptop.local:3847|ws_notes",
        name = "notes",
        path = "/tmp/notes",
        state = WorkspaceState.Available,
        workspaceId = "ws_notes",
        lastUsedAt = "2026-08-02T00:00:00.000Z",
        connectionId = "http://laptop.local:3847",
        connectionName = "laptop",
        connectionColorId = "tide",
        connectionIconId = "bolt",
    )
    private val docs = WorkspaceRow(
        id = "http://desktop.local:3847|ws_docs",
        name = "docs",
        path = "/tmp/docs",
        state = WorkspaceState.Available,
        workspaceId = "ws_docs",
        lastUsedAt = "2026-08-03T00:00:00.000Z",
        connectionId = "http://desktop.local:3847",
        connectionName = "desktop",
        connectionColorId = "ink",
        connectionIconId = "mark",
    )

    @Test
    fun rendersWorkspaceRowsWithNamesAndPaths() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                WorkspaceChooserScreen(
                    uiState = chooserState(listOf(docs, notes)),
                    onBack = {},
                    onSearchChanged = {},
                    onWorkspaceSelected = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("workspace_chooser_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("workspace_chooser_back").assertIsDisplayed()
        composeTestRule.onNodeWithTag("workspace_chooser_search").assertIsDisplayed()
        composeTestRule.onNodeWithTag("workspace_chooser_row_${docs.id}").assertIsDisplayed()
        composeTestRule.onNodeWithTag("workspace_chooser_row_${notes.id}").assertIsDisplayed()
        composeTestRule.onNodeWithText("docs").assertIsDisplayed()
        composeTestRule.onNodeWithText("/tmp/notes").assertIsDisplayed()
    }

    @Test
    fun searchFiltersRowsByNameAndPath() {
        var search by mutableStateOf("")
        composeTestRule.setContent {
            val rows = listOf(docs, notes)
            val visible = rows.filter { row ->
                search.isEmpty() ||
                    row.name.contains(search, ignoreCase = true) ||
                    row.path.contains(search, ignoreCase = true)
            }
            HaroldTheme(dynamicColor = false) {
                WorkspaceChooserScreen(
                    uiState = chooserState(visible).copy(search = search),
                    onBack = {},
                    onSearchChanged = { query -> search = query },
                    onWorkspaceSelected = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("workspace_chooser_search").performTextInput("docs")

        composeTestRule.onNodeWithTag("workspace_chooser_row_${docs.id}").assertIsDisplayed()
        composeTestRule.onNodeWithTag("workspace_chooser_row_${notes.id}").assertDoesNotExist()
    }

    @Test
    fun tappingARowReportsThatWorkspace() {
        var selected: WorkspaceRow? = null
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                WorkspaceChooserScreen(
                    uiState = chooserState(listOf(docs, notes)),
                    onBack = {},
                    onSearchChanged = {},
                    onWorkspaceSelected = { row -> selected = row },
                )
            }
        }

        composeTestRule.onNodeWithTag("workspace_chooser_row_${notes.id}").performClick()

        assertEquals("ws_notes", selected?.workspaceId)
    }

    private fun chooserState(rows: List<WorkspaceRow>) = WorkspaceChooserUiState(
        workspaces = rows,
        visibleWorkspaces = rows,
        hasLoaded = true,
        loading = false,
    )
}
