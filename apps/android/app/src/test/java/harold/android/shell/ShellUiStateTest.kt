package harold.android.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import harold.android.stream.ConnectionState
import harold.android.stream.ConnectionStatus
import harold.android.session.PairedState

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
        assertEquals("Connecting", labelFor(ConnectionStatus.Connecting))
        assertEquals("Live", labelFor(ConnectionStatus.Live))
        assertEquals("Reconnecting (attempt 3)", labelFor(ConnectionStatus.Reconnecting(attempt = 3)))
        assertEquals("Auth failed", labelFor(ConnectionStatus.AuthFailed(detail = null)))
        assertEquals(
            "Auth failed. Device revoked",
            labelFor(ConnectionStatus.AuthFailed(detail = "Device revoked")),
        )
        assertEquals(
            "Transport error. Unknown event type",
            labelFor(ConnectionStatus.TransportError("Unknown event type")),
        )
    }

    @Test
    fun offersRetryOnlyWhenAutoRetryHasStopped() {
        assertFalse(uiFor(ConnectionStatus.Connecting).retryVisible)
        assertFalse(uiFor(ConnectionStatus.Live).retryVisible)
        assertFalse(uiFor(ConnectionStatus.Reconnecting(attempt = 2)).retryVisible)
        assertTrue(uiFor(ConnectionStatus.AuthFailed(detail = null)).retryVisible)
        assertTrue(uiFor(ConnectionStatus.TransportError("drift")).retryVisible)
    }

    @Test
    fun keepsRepairAvailableWhenAuthFails() {
        val state = ShellUiState()
            .fromPairedState(PairedState.Paired("http://127.0.0.1:8787", "device_01", "Pixel"))
            .fromConnectionStatus(ConnectionStatus.AuthFailed(detail = null))

        assertEquals("Re-pair", state.pairLabel)
        assertTrue(state.pairEnabled)
        assertTrue(state.retryVisible)
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
    fun clearsConnectionDetailWhenTheDeviceIsNotPaired() {
        val state = ShellUiState()
            .fromConnectionStatus(ConnectionStatus.AuthFailed(detail = "gone"))
            .fromWorkspaceProbe(WorkspaceProbe.Loaded(count = 2))
            .fromPairedState(PairedState.NotPaired)

        assertNull(state.connectionStatus)
        assertNull(state.workspacesSummary)
        assertFalse(state.retryVisible)
        assertEquals("Pair", state.pairLabel)
    }

    private fun labelFor(status: ConnectionStatus): String? = uiFor(status).connectionStatus

    private fun uiFor(status: ConnectionStatus): ShellUiState =
        ShellUiState().fromConnectionState(ConnectionState(status = status))

    private fun summaryFor(probe: WorkspaceProbe): String? =
        ShellUiState().fromWorkspaceProbe(probe).workspacesSummary
}

private fun ShellUiState.fromConnectionStatus(status: ConnectionStatus): ShellUiState =
    fromConnectionState(ConnectionState(status = status))
