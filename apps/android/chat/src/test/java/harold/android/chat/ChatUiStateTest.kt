package harold.android.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import harold.android.chat.composer.ComposerConfigUi
import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthSession
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AuthSessionStatus
import harold.android.contracts.PermissionRequest
import harold.android.contracts.PermissionStatus
import harold.android.contracts.SessionState
import harold.android.live.AcpTranscriptState
import harold.android.live.emptyAcpTranscript

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

    @Test
    fun switchingSessionsClearsTheSessionScopedSurface() {
        val busy = ChatUiState(
            connectionBanner = "Reconnecting",
            selectedSession = sessionRow(SessionState.Running),
            sessions = listOf(sessionRow(SessionState.Running)),
            recentSessions = listOf(sessionRow(SessionState.Running)),
            pickerVisible = true,
            transcript = AcpTranscriptState(sessionState = SessionState.Running, live = true),
            composerText = "draft prompt",
            composerSubmitting = true,
            composerError = "send failed",
            composerConfig = ComposerConfigUi(error = "stale"),
            voiceCommandPrefix = "/plan ",
            voiceCommandListVisible = true,
            pendingPermissions = listOf(permissionRequest()),
            permissionUiState = PermissionUiState(submittingOptionId = "allow"),
            extensionUiState = ExtensionUiState(submitting = true, error = "extension failed"),
            streamReconnecting = true,
            agentAuth = auth(AgentAuthStatus.Authenticated),
            agentAuthSummary = summary(AgentAuthStatus.Authenticated),
            authPanelSubmitting = true,
            authActionBusy = true,
            authError = "auth failed",
        )

        val reset = busy.resetSessionScopedState()

        assertNull(reset.selectedSession)
        assertEquals(emptyAcpTranscript, reset.transcript)
        assertEquals("", reset.composerText)
        assertFalse(reset.composerSubmitting)
        assertNull(reset.composerError)
        assertEquals(ComposerConfigUi(), reset.composerConfig)
        assertEquals("", reset.voiceCommandPrefix)
        assertFalse(reset.voiceCommandListVisible)
        assertTrue(reset.pendingPermissions.isEmpty())
        assertEquals(PermissionUiState(), reset.permissionUiState)
        assertEquals(ExtensionUiState(), reset.extensionUiState)
        assertFalse(reset.streamReconnecting)
        assertFalse(reset.pickerVisible)
        // Outside the reset policy: switching sessions leaves these alone.
        // The auth panel slice belongs to the agent-auth module.
        assertEquals("Reconnecting", reset.connectionBanner)
        assertEquals(busy.sessions, reset.sessions)
        assertEquals(busy.recentSessions, reset.recentSessions)
        assertEquals(busy.agentAuth, reset.agentAuth)
        assertEquals(busy.agentAuthSummary, reset.agentAuthSummary)
        assertTrue(reset.authPanelSubmitting)
        assertTrue(reset.authActionBusy)
        assertEquals("auth failed", reset.authError)
    }

    @Test
    fun switchingSessionsCarriesTheNextSessionIntoTheReset() {
        val next = sessionRow(SessionState.Idle)
        val restoredTranscript = AcpTranscriptState(sessionState = SessionState.Offline)
        val restoredPermissions = listOf(permissionRequest())

        val reset = ChatUiState(composerText = "draft prompt").resetSessionScopedState(
            SessionResetKeep(
                selectedSession = next,
                transcript = restoredTranscript,
                pendingPermissions = restoredPermissions,
            ),
        )

        assertEquals(next, reset.selectedSession)
        assertEquals(restoredTranscript, reset.transcript)
        assertEquals(restoredPermissions, reset.pendingPermissions)
        assertEquals("", reset.composerText)
        assertNull(reset.composerError)
        assertFalse(reset.pickerVisible)
    }

    private fun permissionRequest() = PermissionRequest(
        id = "perm_01",
        sessionId = "sess_01",
        turnId = "turn_01",
        toolCallId = "tool_01",
        toolName = "bash",
        status = PermissionStatus.Pending,
        options = emptyList(),
        createdAt = "2026-10-19T00:00:00.000Z",
    )

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
