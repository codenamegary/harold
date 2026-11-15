package harold.android.chat

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import harold.android.contracts.SessionState
import harold.android.ui.theme.HaroldTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class SessionsScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val laptop = ConnectionFilterChoice(
        connectionId = "http://laptop.local:3847",
        name = "laptop",
        colorId = "tide",
        iconId = "bolt",
    )
    private val desktop = ConnectionFilterChoice(
        connectionId = "http://desktop.local:3847",
        name = "desktop",
        colorId = "ink",
        iconId = "mark",
    )
    private val session = SessionRow(
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
    fun emptyCacheShowsSkeletonRowsWhileLoading() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SessionsListContent(
                    uiState = SessionsUiState(loading = true),
                    onSearchChanged = {},
                    onSessionClick = {},
                    onDeleteSession = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("sessions_list_loading").assertIsDisplayed()
    }

    @Test
    fun refreshingChipShowsNoStatusText() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SessionsListContent(
                    uiState = SessionsUiState(
                        sessions = listOf(session),
                        connections = listOf(laptop),
                        refreshingConnectionIds = setOf(laptop.connectionId),
                        loading = true,
                    ),
                    onSearchChanged = {},
                    onSessionClick = {},
                    onDeleteSession = {},
                )
            }
        }

        composeTestRule.onNodeWithText("Refreshing", substring = true).assertDoesNotExist()
        composeTestRule.onNodeWithTag("session_row_${session.id}").assertIsDisplayed()
    }

    @Test
    fun failedConnectionChipCarriesTheErrorState() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SessionsListContent(
                    uiState = SessionsUiState(
                        sessions = listOf(session),
                        connections = listOf(laptop, desktop),
                        connectionErrors = mapOf(
                            laptop.connectionId to "Sign in on the host to list this agent's sessions.",
                        ),
                        loading = false,
                    ),
                    onSearchChanged = {},
                    onSessionClick = {},
                    onDeleteSession = {},
                )
            }
        }

        composeTestRule
            .onNodeWithTag("session_filter_${laptop.connectionId}")
            .assert(
                SemanticsMatcher.expectValue(
                    SemanticsProperties.StateDescription,
                    "Refresh failed: Sign in on the host to list this agent's sessions.",
                ),
            )
        composeTestRule
            .onNodeWithTag("session_filter_${desktop.connectionId}")
            .assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.StateDescription))
    }

    @Test
    fun searchFieldHasNoLoadingSpinner() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SessionsListContent(
                    uiState = SessionsUiState(
                        sessions = listOf(session),
                        loading = true,
                    ),
                    onSearchChanged = {},
                    onSessionClick = {},
                    onDeleteSession = {},
                )
            }
        }

        composeTestRule.onNodeWithTag("sessions_search_loading").assertDoesNotExist()
        composeTestRule.onNodeWithTag("session_row_${session.id}").assertIsDisplayed()
    }

    @Test
    fun refreshingConnectionShowsSpinnerOnItsChipOnly() {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                SessionsListContent(
                    uiState = SessionsUiState(
                        sessions = listOf(session),
                        connections = listOf(laptop, desktop),
                        refreshingConnectionIds = setOf(laptop.connectionId),
                        loading = true,
                    ),
                    onSearchChanged = {},
                    onSessionClick = {},
                    onDeleteSession = {},
                )
            }
        }

        composeTestRule
            .onNodeWithTag("session_filter_loading_${laptop.connectionId}", useUnmergedTree = true)
            .assertIsDisplayed()
        composeTestRule
            .onNodeWithTag("session_filter_loading_${desktop.connectionId}", useUnmergedTree = true)
            .assertDoesNotExist()
    }
}
