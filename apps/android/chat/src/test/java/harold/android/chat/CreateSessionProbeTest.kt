package harold.android.chat

import harold.android.contracts.WorkspaceState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CreateSessionProbeTest {

    @Test
    fun factsReportTheOfferedAndSelectedWorkspaceAndAgent() {
        val probe = CreateSessionProbe(FakeCreateSessionProbeHost(state()))

        val facts = probe.facts()

        assertEquals("cat-screensaver", facts["workspaceId"])
        assertEquals("cat-screensaver", facts["workspaceLabel"])
        assertEquals("2", facts["workspaceCount"])
        assertEquals("cat-screensaver|harold", facts["workspaceIds"])
        assertEquals("cat-screensaver|harold", facts["workspaceLabels"])
        assertEquals("opencode", facts["agentId"])
        assertEquals("OpenCode", facts["agentLabel"])
        assertEquals("2", facts["agentCount"])
        assertEquals("opencode|claude", facts["agentIds"])
        assertEquals("OpenCode|Claude", facts["agentLabels"])
        assertEquals("true", facts["submitEnabled"])
        assertEquals("false", facts["submitting"])
        assertEquals("", facts["error"])
    }

    @Test
    fun submitIsDisabledUntilBothPickersHoldAValidSelection() {
        assertFalse(createSessionSubmitEnabled(state().copy(selectedAgentId = null)))
        assertFalse(createSessionSubmitEnabled(state().copy(selectedWorkspaceId = "gone")))
        assertFalse(createSessionSubmitEnabled(state().copy(submitting = true)))
        assertTrue(createSessionSubmitEnabled(state()))
    }

    @Test
    fun settledIsFalseOnlyWhileTheCreateRequestIsInFlight() {
        assertTrue(createSessionProbeSettled(state()))
        assertFalse(createSessionProbeSettled(state().copy(submitting = true)))
    }

    @Test
    fun pickAndSubmitDispatchOntoTheViewModelCallsTheScreenUses() {
        val host = FakeCreateSessionProbeHost(state())
        val probe = CreateSessionProbe(host)

        assertTrue(probe.perform("pick_workspace", mapOf("id" to "harold")))
        assertTrue(probe.perform("pick_agent", mapOf("agentId" to "claude")))
        assertTrue(probe.perform("submit", emptyMap()))
        assertTrue(probe.perform("back", emptyMap()))

        assertEquals(
            listOf("pickWorkspace:harold", "pickAgent:claude", "submit", "back"),
            host.calls,
        )
    }

    @Test
    fun unknownActionsAreRefused() {
        val host = FakeCreateSessionProbeHost(state())
        val probe = CreateSessionProbe(host)

        assertFalse(probe.perform("open_workspace_menu", emptyMap()))
        assertTrue(host.calls.isEmpty())
        assertEquals(listOf("pick_workspace", "pick_agent", "submit", "back"), probe.actions())
    }

    @Test
    fun tagNamesMatchTheStringsTheScreenApplies() {
        assertEquals(
            "create_session_agent_option_opencode",
            createSessionAgentOptionTag("opencode"),
        )
        assertEquals(
            "create_session_workspace_option_cat-screensaver",
            createSessionWorkspaceOptionTag("cat-screensaver"),
        )
    }
}

private class FakeCreateSessionProbeHost(
    initialState: CreateSessionUiState,
) : CreateSessionProbeHost {
    private var current: CreateSessionUiState = initialState
    val calls = mutableListOf<String>()

    override fun state(): CreateSessionUiState = current

    override fun pickWorkspace(id: String?) {
        calls += "pickWorkspace:$id"
    }

    override fun pickAgent(agentId: String?) {
        calls += "pickAgent:$agentId"
    }

    override fun submit() {
        calls += "submit"
    }

    override fun back() {
        calls += "back"
    }
}

private fun state() = CreateSessionUiState(
    workspaces = listOf(
        WorkspaceRow(
            id = "cat-screensaver",
            name = "cat-screensaver",
            path = "/work/cat-screensaver",
            state = WorkspaceState.Available,
        ),
        WorkspaceRow(
            id = "harold",
            name = "harold",
            path = "/work/harold",
            state = WorkspaceState.Available,
        ),
    ),
    agents = listOf(
        AgentOption(id = "opencode", displayName = "OpenCode"),
        AgentOption(id = "claude", displayName = "Claude"),
    ),
    selectedWorkspaceId = "cat-screensaver",
    selectedAgentId = "opencode",
)
