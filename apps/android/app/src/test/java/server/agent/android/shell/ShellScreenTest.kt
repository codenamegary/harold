package server.agent.android.shell

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
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
import server.agent.android.events.ConnectionState
import server.agent.android.events.ConnectionStatus
import server.agent.android.session.PairedState
import server.agent.android.ui.theme.AgentServerTheme

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30])
class ShellScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsAgentServerNotPairedAndPairButton() {
        setShell(ShellUiState())

        composeTestRule.onNodeWithTag("shell_app_mark").assertIsDisplayed()
        assertTrue(composeTestRule.onAllNodesWithText("Agent Server").fetchSemanticsNodes().isNotEmpty())
        composeTestRule.onNodeWithText("OPERATOR CONSOLE").assertIsDisplayed()
        composeTestRule.onNodeWithText("Not paired").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("shell_hint").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("shell_pair_button")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun showsConnectingWhileTheStreamOpens() {
        setShell(pairedWith(ConnectionStatus.Connecting))

        composeTestRule.onNodeWithTag("shell_connection_status").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("Connecting").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun showsLiveOnceTheStreamIsOpen() {
        setShell(pairedWith(ConnectionStatus.Live))

        composeTestRule.onNodeWithText("Live").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun showsReconnectingWithTheAttemptCount() {
        setShell(pairedWith(ConnectionStatus.Reconnecting(attempt = 2)))

        composeTestRule.onNodeWithText("Reconnecting (attempt 2)").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun showsTransportErrors() {
        setShell(pairedWith(ConnectionStatus.TransportError("unknown event type")))

        composeTestRule.onNodeWithText("Transport error. unknown event type")
            .performScrollTo()
            .assertIsDisplayed()
    }

    @Test
    fun offersRetryAndRepairWhenAuthFails() {
        var retries = 0
        setShell(pairedWith(ConnectionStatus.AuthFailed(detail = null)), onRetryClick = { retries += 1 })

        composeTestRule.onNodeWithText("Auth failed").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("shell_retry_button")
            .assertIsDisplayed()
            .assertHeightIsAtLeast(48.dp)
            .performClick()
        composeTestRule.onNodeWithTag("shell_pair_button").assertIsDisplayed()
        composeTestRule.onNodeWithText("Re-pair").assertIsDisplayed()

        assertEquals(1, retries)
    }

    @Test
    fun hidesRetryWhileTheStreamIsHealthy() {
        setShell(pairedWith(ConnectionStatus.Live))

        assertEquals(
            0,
            composeTestRule.onAllNodesWithTag("shell_retry_button").fetchSemanticsNodes().size,
        )
    }

    @Test
    fun showsTheWorkspaceProbeResult() {
        setShell(pairedWith(ConnectionStatus.Live).fromWorkspaceProbe(WorkspaceProbe.Loaded(count = 4)))

        composeTestRule.onNodeWithTag("shell_workspaces_summary").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("4 workspaces").performScrollTo().assertIsDisplayed()
    }

    private fun setShell(
        uiState: ShellUiState,
        onRetryClick: () -> Unit = {},
    ) {
        composeTestRule.setContent {
            AgentServerTheme(dynamicColor = false) {
                ShellScreen(
                    uiState = uiState,
                    onPairClick = {},
                    onRetryClick = onRetryClick,
                )
            }
        }
    }

    private fun pairedWith(status: ConnectionStatus): ShellUiState =
        ShellUiState()
            .fromPairedState(PairedState.Paired("http://127.0.0.1:8787", "device_01", "Pixel"))
            .fromConnectionState(ConnectionState(status = status))
}
