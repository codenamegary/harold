package harold.android.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ShellProbeTest {
    @Test
    fun factsReportTheEmptyHome() {
        val facts = shellProbeFacts(ShellUiState())

        assertEquals("No connections yet", facts["status"])
        assertEquals("Add connection", facts["addConnectionLabel"])
        assertEquals("true", facts["addConnectionEnabled"])
        assertEquals("false", facts["retryVisible"])
        assertEquals("", facts["connectionStatus"])
    }

    @Test
    fun addConnectionAndRetryDispatchOntoTheScreenCallbacks() {
        val host = FakeShellProbeHost()
        val probe = ShellProbe(host)

        assertTrue(probe.perform("add_connection", emptyMap()))
        assertTrue(probe.perform("retry", emptyMap()))

        assertEquals(listOf("addConnection", "retry"), host.calls)
    }

    @Test
    fun unknownActionsAreRefused() {
        val host = FakeShellProbeHost()
        val probe = ShellProbe(host)

        assertFalse(probe.perform("open_session_menu", emptyMap()))
        assertTrue(host.calls.isEmpty())
        assertEquals(listOf("add_connection", "retry"), probe.actions())
    }

    @Test
    fun theScreenNameIsShell() {
        assertEquals("shell", ShellProbe(FakeShellProbeHost()).name)
    }
}

private class FakeShellProbeHost : ShellProbeHost {
    val calls = mutableListOf<String>()

    override fun state(): ShellUiState = ShellUiState()

    override fun addConnection() {
        calls += "addConnection"
    }

    override fun retry() {
        calls += "retry"
    }
}
