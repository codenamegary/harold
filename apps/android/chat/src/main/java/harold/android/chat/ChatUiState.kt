package harold.android.chat

import harold.android.chat.auth.authPanelSummary
import harold.android.chat.composer.ComposerConfigUi
import harold.android.contracts.AgentAuth
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import harold.android.contracts.AuthSessionStatus
import harold.android.contracts.AvailableCommand
import harold.android.contracts.PermissionRequest
import harold.android.contracts.SessionState
import harold.android.contracts.catalogSessionKey
import harold.android.live.AcpTranscriptState
import harold.android.live.StreamExtension
import harold.android.live.emptyAcpTranscript
import harold.android.voice.VoiceDictationUiState

data class SessionRow(
    val sessionId: String,
    val name: String,
    val cwd: String,
    val workspaceId: String,
    val workspaceLabel: String,
    val agentId: AgentId,
    val agentLabel: String,
    val state: SessionState,
    val updatedAt: String,
    val serverOrigin: String = "",
    val haroldName: String = "",
    val haroldColorId: String = "",
    val haroldIconId: String = "",
    val haroldReachable: Boolean = true,
    val needsAttention: Boolean = false,
) {
    val id: String
        get() = if (serverOrigin.isEmpty()) {
            catalogSessionKey(agentId, sessionId)
        } else {
            "$serverOrigin|${catalogSessionKey(agentId, sessionId)}"
        }
}

data class AgentOption(
    val id: AgentId,
    val displayName: String,
)

data class CreateSessionUiState(
    val workspaces: List<WorkspaceRow> = emptyList(),
    val agents: List<AgentOption> = emptyList(),
    val selectedWorkspaceId: String = "",
    val selectedAgentId: AgentId? = null,
    val submitting: Boolean = false,
    val error: String? = null,
)

data class PermissionUiState(
    val submittingOptionId: String? = null,
    val error: String? = null,
)

data class ExtensionUiState(
    val request: StreamExtension? = null,
    val replyText: String = "{}",
    val submitting: Boolean = false,
    val error: String? = null,
)

data class ChatUiState(
    val connectionBanner: String? = null,
    val selectedSession: SessionRow? = null,
    val sessions: List<SessionRow> = emptyList(),
    val sessionsLoading: Boolean = false,
    val sessionsError: String? = null,
    val pickerVisible: Boolean = false,
    val recentSessions: List<SessionRow> = emptyList(),
    val recentSessionsLoading: Boolean = false,
    val recentSessionsError: String? = null,
    val transcript: AcpTranscriptState = emptyAcpTranscript,
    val composerText: String = "",
    val composerSubmitting: Boolean = false,
    val composerError: String? = null,
    val composerConfig: ComposerConfigUi = ComposerConfigUi(),
    val cancelSubmitting: Boolean = false,
    val cancelError: String? = null,
    val streamReconnecting: Boolean = false,
    val pendingPermissions: List<PermissionRequest> = emptyList(),
    val permissionUiState: PermissionUiState = PermissionUiState(),
    val extensionUiState: ExtensionUiState = ExtensionUiState(),
    val notificationPermissionDenied: Boolean = false,
    val voiceDictation: VoiceDictationUiState = VoiceDictationUiState(),
    val availableCommands: List<AvailableCommand> = emptyList(),
    val supportsImageAttachments: Boolean = false,
    val supportsFileAttachments: Boolean = false,
    val pendingAttachments: List<PendingAttachmentUi> = emptyList(),
    /** A completed slash command chosen from the picker in voice mode, e.g. "/plan ". */
    val voiceCommandPrefix: String = "",
    /** Voice mode toggles the command list from a button instead of a typed slash. */
    val voiceCommandListVisible: Boolean = false,
    val agentAuth: AgentAuth? = null,
    val agentAuthSummary: AgentAuthSummary? = null,
    val authPanelSubmitting: Boolean = false,
    val authActionBusy: Boolean = false,
    val authError: String? = null,
    val activeHaroldName: String = "",
    val activeHaroldColorId: String = "",
    val activeHaroldIconId: String = "",
) {
    val disconnectHaroldName: String
        get() = selectedSession?.haroldName?.takeIf { it.isNotEmpty() } ?: activeHaroldName

    val disconnectHaroldColorId: String
        get() = selectedSession?.haroldColorId?.takeIf { it.isNotEmpty() } ?: activeHaroldColorId

    val disconnectHaroldIconId: String
        get() = selectedSession?.haroldIconId?.takeIf { it.isNotEmpty() } ?: activeHaroldIconId

    val activePermissionRequest: PermissionRequest?
        get() = activePermissionRequest(pendingPermissions)

    val authSummary: AgentAuthSummary?
        get() = authPanelSummary(agentAuth, agentAuthSummary)

    val showAuthPanel: Boolean
        get() {
            val sessionInFlight = agentAuth?.session?.status == AuthSessionStatus.InProgress
            if (sessionInFlight) {
                return true
            }
            return when (authSummary?.status) {
                AgentAuthStatus.NeedsAuth,
                AgentAuthStatus.Error,
                -> true
                AgentAuthStatus.Unknown,
                AgentAuthStatus.Authenticated,
                null,
                -> false
            }
        }

    val effectiveSessionState: SessionState?
        get() = resolveEffectiveSessionState(
            sessionId = selectedSession?.sessionId.orEmpty(),
            transcriptSessionState = transcript.sessionState,
            listSessionState = selectedSession?.state,
        )

    val composerEnabled: Boolean
        get() {
            val session = selectedSession ?: return false
            return session.haroldReachable &&
                isComposerPromptable(
                    agentId = session.agentId,
                    sessionId = session.sessionId,
                    sessionState = effectiveSessionState,
                ) && !composerSubmitting && !streamReconnecting
        }

    val isPendingNewSession: Boolean
        get() = selectedSession?.sessionId?.isEmpty() == true

    val composerBlockedMessage: String?
        get() = when {
            selectedSession?.haroldReachable == false -> WAITING_FOR_HAROLD
            isPendingNewSession -> PENDING_SESSION_MESSAGE
            // The reconnect banner already explains why the composer is
            // locked. Showing the Offline message too just adds a red line
            // under the transcript while the replay is still streaming.
            streamReconnecting -> null
            else -> composerBlockedMessage(effectiveSessionState)
        }

    val showComposerCancel: Boolean
        get() = showComposerCancel(effectiveSessionState) && !cancelSubmitting

    val sessionProgressMessage: String?
        get() = sessionProgressMessage(effectiveSessionState)

    val showProgress: Boolean
        get() = sessionProgressMessage != null

    val showEmptyWelcome: Boolean
        get() = selectedSession != null && transcript.rows.isEmpty() && !showProgress

    val showSelectSessionCta: Boolean
        get() = selectedSession == null && !sessionsLoading

    /** Voice replaces the text slot whenever a dictation session is open. */
    val composerInVoiceMode: Boolean
        get() = voiceDictation.visible

    /** The full voice message: the picked command prefix plus the live transcript. */
    val voiceMessage: String
        get() = voiceCommandPrefix + voiceDictation.transcript
}

/**
 * The values an incoming session supplies instead of the defaults when the
 * session-scoped surface resets. The auth panel slice is not here: the
 * [harold.android.chat.auth.AgentAuthController] owns it and resets itself.
 */
internal data class SessionResetKeep(
    val selectedSession: SessionRow? = null,
    val transcript: AcpTranscriptState = emptyAcpTranscript,
    val pendingPermissions: List<PermissionRequest> = emptyList(),
)

/**
 * The one session-reset policy. Selecting, creating, or dropping a session
 * clears every session-scoped surface back to its default; the keep slot
 * carries what the next session brings with it. A new session-scoped
 * [ChatUiState] field gets exactly one edit here.
 */
internal fun ChatUiState.resetSessionScopedState(
    keep: SessionResetKeep = SessionResetKeep(),
): ChatUiState = copy(
    selectedSession = keep.selectedSession,
    transcript = keep.transcript,
    composerText = "",
    composerSubmitting = false,
    composerError = null,
    composerConfig = ComposerConfigUi(),
    availableCommands = emptyList(),
    voiceCommandPrefix = "",
    voiceCommandListVisible = false,
    pendingPermissions = keep.pendingPermissions,
    permissionUiState = PermissionUiState(),
    extensionUiState = ExtensionUiState(),
    streamReconnecting = false,
    pickerVisible = false,
)
