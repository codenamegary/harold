package harold.android.chat.auth

import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AuthSessionStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AgentAuthUiStateTest {
    private fun summary(
        status: AgentAuthStatus,
        error: String? = null,
        canLogout: Boolean = false,
    ) = AgentAuthSummary(
        status = status,
        error = error,
        activeSessionId = null,
        canLogout = canLogout,
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
        assertFalse(AgentAuthUiState(summary = summary(AgentAuthStatus.Unknown)).showAuthPanel)
    }

    @Test
    fun unknownSummaryWithErrorHidesAuthPanel() {
        assertFalse(
            AgentAuthUiState(
                summary = summary(AgentAuthStatus.Unknown, error = "probe failed"),
            ).showAuthPanel,
        )
    }

    @Test
    fun needsAuthSummaryShowsAuthPanel() {
        assertTrue(
            AgentAuthUiState(summary = summary(AgentAuthStatus.NeedsAuth)).showAuthPanel,
        )
    }

    @Test
    fun errorSummaryShowsAuthPanel() {
        assertTrue(
            AgentAuthUiState(summary = summary(AgentAuthStatus.Error)).showAuthPanel,
        )
    }

    @Test
    fun authenticatedSummaryHidesAuthPanel() {
        assertFalse(
            AgentAuthUiState(summary = summary(AgentAuthStatus.Authenticated)).showAuthPanel,
        )
    }

    @Test
    fun noAuthStateHidesAuthPanel() {
        assertFalse(AgentAuthUiState().showAuthPanel)
    }

    @Test
    fun inFlightSessionShowsAuthPanelEvenWhenStatusIsUnknown() {
        assertTrue(
            AgentAuthUiState(
                agentAuth = auth(AgentAuthStatus.Unknown, session = inFlightSession()),
            ).showAuthPanel,
        )
    }

    @Test
    fun resolvedSummaryWinsOverTheDerivedOne() {
        val state = AgentAuthUiState(
            agentAuth = auth(AgentAuthStatus.Unknown),
            summary = summary(AgentAuthStatus.NeedsAuth),
        )

        assertEquals(AgentAuthStatus.NeedsAuth, state.authSummary?.status)
    }

    @Test
    fun derivedSummaryReportsTheInFlightSessionAndOffersNoLogout() {
        val state = AgentAuthUiState(
            agentAuth = auth(AgentAuthStatus.NeedsAuth, session = inFlightSession()),
        )

        assertEquals(AgentAuthStatus.NeedsAuth, state.authSummary?.status)
        assertEquals("auth-1", state.authSummary?.activeSessionId)
        assertFalse(state.authSummary?.canLogout == true)
    }

    @Test
    fun noAuthStateHasNoSummary() {
        assertNull(AgentAuthUiState().authSummary)
    }

    @Test
    fun canLogoutActionRequiresASummaryThatAllowsLogout() {
        assertFalse(AgentAuthUiState().canLogoutAction)
        assertFalse(
            AgentAuthUiState(summary = summary(AgentAuthStatus.Authenticated)).canLogoutAction,
        )
    }

    @Test
    fun canLogoutActionAllowsAnIdleLoggableAgent() {
        assertTrue(
            AgentAuthUiState(
                summary = summary(AgentAuthStatus.Authenticated, canLogout = true),
            ).canLogoutAction,
        )
    }

    @Test
    fun canLogoutActionBlocksWhileThePanelIsBusy() {
        val summary = summary(AgentAuthStatus.Authenticated, canLogout = true)

        assertFalse(
            AgentAuthUiState(summary = summary, panelSubmitting = true).canLogoutAction,
        )
        assertFalse(
            AgentAuthUiState(summary = summary, actionBusy = true).canLogoutAction,
        )
    }

    @Test
    fun canLogoutActionBlocksWhileAnAuthSessionIsInFlight() {
        assertFalse(
            AgentAuthUiState(
                summary = summary(AgentAuthStatus.Authenticated, canLogout = true),
                agentAuth = auth(AgentAuthStatus.NeedsAuth, session = inFlightSession()),
            ).canLogoutAction,
        )
    }
}
