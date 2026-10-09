package harold.android.chat

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AuthSessionStatus

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
}
