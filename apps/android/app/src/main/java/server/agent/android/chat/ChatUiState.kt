package server.agent.android.chat

import kotlinx.serialization.json.JsonElement
import server.agent.android.contracts.AgentAuth
import server.agent.android.contracts.AgentAuthStatus
import server.agent.android.contracts.AgentAuthSummary
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.AuthSessionStatus
import server.agent.android.contracts.PermissionRequest
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.WorkspaceState
import server.agent.android.contracts.catalogSessionKey

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
) {
    val id: String
        get() = catalogSessionKey(agentId, sessionId)
}

data class WorkspaceRow(
    val id: String,
    val name: String,
    val path: String,
    val state: WorkspaceState,
)

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

data class StreamExtension(
    val requestId: String,
    val method: String,
    val params: JsonElement,
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
    val sessionsList: List<SessionRow> = emptyList(),
    val sessionsListSearch: String = "",
    val sessionsListLoading: Boolean = false,
    val sessionsListError: String? = null,
    val createDialogVisible: Boolean = false,
    val createState: CreateSessionUiState = CreateSessionUiState(),
    val transcript: AcpTranscriptState = emptyAcpTranscript,
    val composerText: String = "",
    val composerSubmitting: Boolean = false,
    val composerError: String? = null,
    val cancelSubmitting: Boolean = false,
    val cancelError: String? = null,
    val streamReconnecting: Boolean = false,
    val pendingPermissions: List<PermissionRequest> = emptyList(),
    val permissionUiState: PermissionUiState = PermissionUiState(),
    val extensionUiState: ExtensionUiState = ExtensionUiState(),
    val notificationPermissionDenied: Boolean = false,
    val voiceDictation: VoiceDictationUiState = VoiceDictationUiState(),
    val agentAuth: AgentAuth? = null,
    val agentAuthSummary: AgentAuthSummary? = null,
    val authPanelSubmitting: Boolean = false,
    val authActionBusy: Boolean = false,
    val authError: String? = null,
) {
    val activePermissionRequest: PermissionRequest?
        get() = activePermissionRequest(pendingPermissions)

    val authSummary: AgentAuthSummary?
        get() = agentAuthSummary
            ?: agentAuth?.let { auth ->
                AgentAuthSummary(
                    status = auth.status,
                    error = auth.error,
                    activeSessionId = auth.session
                        ?.takeIf { it.status == AuthSessionStatus.InProgress }
                        ?.sessionId,
                    canLogout = false,
                )
            }

    val showAuthPanel: Boolean
        get() {
            val sessionInFlight = agentAuth?.session?.status == AuthSessionStatus.InProgress
            if (sessionInFlight) {
                return true
            }
            return when (authSummary?.status) {
                AgentAuthStatus.NeedsAuth,
                AgentAuthStatus.Error,
                AgentAuthStatus.Unknown,
                -> true
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
            return isComposerPromptable(
                workspaceId = session.workspaceId,
                agentId = session.agentId,
                sessionId = session.sessionId,
                sessionState = effectiveSessionState,
            ) && !composerSubmitting && !streamReconnecting
        }

    val isDraftNewSession: Boolean
        get() = selectedSession?.sessionId?.isEmpty() == true

    val composerBlockedMessage: String?
        get() = composerBlockedMessage(effectiveSessionState)

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
}
