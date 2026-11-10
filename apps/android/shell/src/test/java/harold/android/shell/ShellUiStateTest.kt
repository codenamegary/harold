package harold.android.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import harold.android.stream.ConnectionState
import harold.android.stream.StreamStatus
import harold.android.session.ActiveConnectionState

class ShellUiStateTest {
    @Test
    fun showsNoConnectionUntilTheStreamStarts() {
        val state = ShellUiState()

        assertNull(state.connectionStatus)
        assertNull(state.workspacesSummary)
        assertFalse(state.retryVisible)
    }

    @Test
    fun labelsEachConnectionStatus() {
        assertEquals("Connecting", labelFor(StreamStatus.Connecting))
        assertEquals("Live", labelFor(StreamStatus.Live))
        assertEquals("Reconnecting (attempt 3)", labelFor(StreamStatus.Reconnecting(attempt = 3)))
        assertEquals("Auth failed", labelFor(StreamStatus.AuthFailed(detail = null)))
        assertEquals(
            "Auth failed. Device revoked",
            labelFor(StreamStatus.AuthFailed(detail = "Device revoked")),
        )
        assertEquals(
            "Transport error. Unknown event type",
            labelFor(StreamStatus.TransportError("Unknown event type")),
        )
    }

    @Test
    fun offersRetryOnlyWhenAutoRetryHasStopped() {
        assertFalse(uiFor(StreamStatus.Connecting).retryVisible)
        assertFalse(uiFor(StreamStatus.Live).retryVisible)
        assertFalse(uiFor(StreamStatus.Reconnecting(attempt = 2)).retryVisible)
        assertTrue(uiFor(StreamStatus.AuthFailed(detail = null)).retryVisible)
        assertTrue(uiFor(StreamStatus.TransportError("drift")).retryVisible)
    }

    @Test
    fun keepsChangeConnectionAvailableWhenAuthFails() {
        val state = ShellUiState()
            .fromActiveConnectionState(ActiveConnectionState.Active("ssh://gary@127.0.0.1:22", "Pixel"))
            .fromConnectionStatus(StreamStatus.AuthFailed(detail = null))

        assertEquals("Change connection", state.addConnectionLabel)
        assertTrue(state.addConnectionEnabled)
    }

    @Test
    fun summarisesTheWorkspaceProbe() {
        assertEquals("Checking workspaces", summaryFor(WorkspaceProbe.Loading))
        assertEquals("No workspaces", summaryFor(WorkspaceProbe.Loaded(count = 0)))
        assertEquals("1 workspace", summaryFor(WorkspaceProbe.Loaded(count = 1)))
        assertEquals("4 workspaces", summaryFor(WorkspaceProbe.Loaded(count = 4)))
        assertEquals(
            "Workspaces unavailable. Could not reach Harold",
            summaryFor(WorkspaceProbe.Failed("Could not reach Harold")),
        )
    }

    @Test
    fun clearsConnectionDetailWhenThereIsNoConnection() {
        val state = ShellUiState()
            .fromConnectionStatus(StreamStatus.AuthFailed(detail = "gone"))
            .fromWorkspaceProbe(WorkspaceProbe.Loaded(count = 2))
            .fromActiveConnectionState(ActiveConnectionState.NoConnection)

        assertNull(state.connectionStatus)
        assertNull(state.workspacesSummary)
        assertFalse(state.retryVisible)
        assertEquals("Add connection", state.addConnectionLabel)
    }

    private fun labelFor(status: StreamStatus): String? = uiFor(status).connectionStatus

    private fun uiFor(status: StreamStatus): ShellUiState =
        ShellUiState().fromConnectionState(ConnectionState(status = status))

    private fun summaryFor(probe: WorkspaceProbe): String? =
        ShellUiState().fromWorkspaceProbe(probe).workspacesSummary
}

private fun ShellUiState.fromConnectionStatus(status: StreamStatus): ShellUiState =
    fromConnectionState(ConnectionState(status = status))
