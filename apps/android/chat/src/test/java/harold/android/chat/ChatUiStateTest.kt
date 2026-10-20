package harold.android.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AuthSessionStatus
import harold.android.contracts.SessionState
import harold.android.live.AcpTranscriptState

class ChatUiStateTest {
    private fun summary(
        status: AgentAuthStatus,
        error: String? = null,
    ) = AgentAuthSummary(
        status = status,
        error = error,
        activeSessionId = null,
        canLogout = false,
    )

    private fun auth(
        status: AgentAuthStatus,
        session: AgentAuthSession? = null,
    ) = AgentAuth(
        agentId = "cursor",
        status = status,
        error = null,
        session = session,
    )

    private fun inFlightSession() = AgentAuthSession(
        sessionId = "auth-1",
        agentId = "cursor",
        status = AuthSessionStatus.InProgress,
        steps = emptyList(),
        error = null,
    )

    @Test
    fun unknownSummaryWithNoErrorHidesAuthPanel() {
        assertFalse(ChatUiState(agentAuthSummary = summary(AgentAuthStatus.Unknown)).showAuthPanel)
    }

    @Test
    fun unknownSummaryWithErrorHidesAuthPanel() {
        assertFalse(
            ChatUiState(
                agentAuthSummary = summary(AgentAuthStatus.Unknown, error = "probe failed"),
            ).showAuthPanel,
        )
    }

    @Test
    fun needsAuthSummaryShowsAuthPanel() {
        assertTrue(
            ChatUiState(agentAuthSummary = summary(AgentAuthStatus.NeedsAuth)).showAuthPanel,
        )
    }

    @Test
    fun errorSummaryShowsAuthPanel() {
        assertTrue(
            ChatUiState(agentAuthSummary = summary(AgentAuthStatus.Error)).showAuthPanel,
        )
    }

    @Test
    fun authenticatedSummaryHidesAuthPanel() {
        assertFalse(
            ChatUiState(agentAuthSummary = summary(AgentAuthStatus.Authenticated)).showAuthPanel,
        )
    }

    @Test
    fun noAuthStateHidesAuthPanel() {
        assertFalse(ChatUiState().showAuthPanel)
    }

    @Test
    fun inFlightSessionShowsAuthPanelEvenWhenStatusIsUnknown() {
        assertTrue(
            ChatUiState(
                agentAuth = auth(AgentAuthStatus.Unknown, session = inFlightSession()),
            ).showAuthPanel,
        )
    }

    @Test
    fun reconnectingStreamHidesTheBlockedMessage() {
        val state = ChatUiState(
            selectedSession = sessionRow(SessionState.Offline),
            transcript = AcpTranscriptState(sessionState = SessionState.Offline),
            streamReconnecting = true,
        )

        assertNull(state.composerBlockedMessage)
    }

    @Test
    fun offlineSessionWithoutReconnectExplainsTheBlockedComposer() {
        val state = ChatUiState(
            selectedSession = sessionRow(SessionState.Offline),
            transcript = AcpTranscriptState(sessionState = SessionState.Offline),
        )

        assertEquals(
            "Session reconnecting. Prompts unlock when it is idle again.",
            state.composerBlockedMessage,
        )
    }

    private fun sessionRow(state: SessionState) = SessionRow(
        sessionId = "sess_01",
        name = "Session",
        cwd = "/tmp/harold",
        workspaceId = "ws_01",
        workspaceLabel = "harold",
        agentId = "cursor",
        agentLabel = "Cursor",
        state = state,
        updatedAt = "2026-10-19T00:00:00.000Z",
    )
}
