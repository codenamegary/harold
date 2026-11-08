package harold.android.shell

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import harold.android.stream.ConnectionState
import harold.android.stream.StreamStatus
import harold.android.session.ActiveConnectionState
import harold.android.ui.theme.HaroldTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class ShellScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsHaroldNoConnectionsAndConnectionButton() {
        setShell(ShellUiState())

        composeTestRule.onNodeWithTag("shell_app_mark").assertIsDisplayed()
        assertTrue(composeTestRule.onAllNodesWithText("Harold").fetchSemanticsNodes().isNotEmpty())
        composeTestRule.onAllNodesWithText("OPERATOR CONSOLE").assertCountEquals(0)
        composeTestRule.onNodeWithText("No connections yet").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("shell_hint").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("shell_add_connection_button")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun showsConnectingWhileTheStreamOpens() {
        setShell(activeWith(StreamStatus.Connecting))

        composeTestRule.onNodeWithTag("shell_connection_status").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("Connecting").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun showsLiveOnceTheStreamIsOpen() {
        setShell(activeWith(StreamStatus.Live))

        composeTestRule.onNodeWithText("Live").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun showsReconnectingWithTheAttemptCount() {
        setShell(activeWith(StreamStatus.Reconnecting(attempt = 2)))

        composeTestRule.onNodeWithText("Reconnecting (attempt 2)").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun showsTransportErrors() {
        setShell(activeWith(StreamStatus.TransportError("unknown event type")))

        composeTestRule.onNodeWithText("Transport error. unknown event type")
            .performScrollTo()
            .assertIsDisplayed()
    }

    @Test
    fun offersRetryAndChangeConnectionWhenAuthFails() {
        var retries = 0
        setShell(activeWith(StreamStatus.AuthFailed(detail = null)), onRetryClick = { retries += 1 })

        composeTestRule.onNodeWithText("Auth failed").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("shell_retry_button")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeTestRule.onNodeWithTag("shell_add_connection_button").assertIsDisplayed()
        composeTestRule.onNodeWithText("Change connection").assertIsDisplayed()

        assertEquals(1, retries)
    }

    @Test
    fun hidesRetryWhileTheStreamIsHealthy() {
        setShell(activeWith(StreamStatus.Live))

        assertEquals(
            0,
            composeTestRule.onAllNodesWithTag("shell_retry_button").fetchSemanticsNodes().size,
        )
    }

    @Test
    fun showsTheWorkspaceProbeResult() {
        setShell(activeWith(StreamStatus.Live).fromWorkspaceProbe(WorkspaceProbe.Loaded(count = 4)))

        composeTestRule.onNodeWithTag("shell_workspaces_summary").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("4 workspaces").performScrollTo().assertIsDisplayed()
    }

    private fun setShell(
        uiState: ShellUiState,
        onRetryClick: () -> Unit = {},
    ) {
        composeTestRule.setContent {
            HaroldTheme(dynamicColor = false) {
                ShellScreen(
                    uiState = uiState,
                    onAddConnectionClick = {},
                    onRetryClick = onRetryClick,
                )
            }
        }
    }

    private fun activeWith(status: StreamStatus): ShellUiState =
        ShellUiState()
            .fromActiveConnectionState(ActiveConnectionState.Active("ssh://gary@127.0.0.1:22", "Pixel"))
            .fromConnectionState(ConnectionState(status = status))
}
