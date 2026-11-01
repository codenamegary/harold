package harold.android.chat

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import harold.android.chat.composer.ComposerConfigUi
import harold.android.contracts.PermissionRequest
import harold.android.contracts.PermissionStatus
import harold.android.contracts.SessionState
import harold.android.live.AcpTranscriptState
import harold.android.live.emptyAcpTranscript

class ChatUiStateTest {
    @Test
    fun selectSessionCtaShowsBeforeTheSessionCacheLoads() {
        val state = ChatUiState(hasLoaded = false, isRefreshing = true)

        assertTrue(state.showSelectSessionCta)
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
            "Session reconnecting.",
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
            cancelSubmitting = true,
            cancelError = "cancel failed",
            changesAvailable = true,
            changesBadgeCount = 17,
        )

        val reset = busy.resetSessionScopedState()

        assertNull(reset.selectedSession)
        assertEquals(emptyAcpTranscript, reset.transcript)
        assertEquals("", reset.composerText)
        assertFalse(reset.composerSubmitting)
        assertNull(reset.composerError)
        assertEquals("", reset.voiceCommandPrefix)
        assertFalse(reset.voiceCommandListVisible)
        assertTrue(reset.pendingPermissions.isEmpty())
        assertEquals(PermissionUiState(), reset.permissionUiState)
        assertEquals(ExtensionUiState(), reset.extensionUiState)
        assertFalse(reset.streamReconnecting)
        assertFalse(reset.cancelSubmitting)
        assertNull(reset.cancelError)
        assertFalse(reset.pickerVisible)
        assertFalse(reset.changesAvailable)
        assertEquals(0, reset.changesBadgeCount)
        // Outside the reset policy: switching sessions leaves these alone.
        assertEquals("Reconnecting", reset.connectionBanner)
        assertEquals(busy.sessions, reset.sessions)
        assertEquals(busy.recentSessions, reset.recentSessions)
        // SessionConfigWriter owns the composer config; clearing it here would
        // strand the bar whenever the next session has the same options.
        assertEquals(busy.composerConfig, reset.composerConfig)
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
