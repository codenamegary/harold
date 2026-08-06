package server.agent.android.chat

import server.agent.android.contracts.AgentId
import server.agent.android.contracts.PermissionRequest
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.WorkspaceState

data class SessionRow(
    val id: String,
    val name: String,
    val workspaceId: String,
    val workspaceLabel: String,
    val agentId: AgentId,
    val agentLabel: String,
    val state: SessionState,
)

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
    val prompt: String = "",
    val submitting: Boolean = false,
    val error: String? = null,
)

data class RenameSessionUiState(
    val sessionId: String = "",
    val name: String = "",
    val submitting: Boolean = false,
    val error: String? = null,
)

data class PermissionUiState(
    val submittingOptionId: String? = null,
    val error: String? = null,
)

data class ChatUiState(
    val connectionBanner: String? = null,
    val selectedSession: SessionRow? = null,
    val sessions: List<SessionRow> = emptyList(),
    val sessionsLoading: Boolean = false,
    val sessionsError: String? = null,
    val pickerVisible: Boolean = false,
    val createDialogVisible: Boolean = false,
    val createState: CreateSessionUiState = CreateSessionUiState(),
    val transcript: TranscriptState = emptyTranscript,
    val composerText: String = "",
    val composerSubmitting: Boolean = false,
    val composerError: String? = null,
    val cancelSubmitting: Boolean = false,
    val cancelError: String? = null,
    val renameDialogVisible: Boolean = false,
    val renameState: RenameSessionUiState = RenameSessionUiState(),
    val archiveDialogVisible: Boolean = false,
    val archiveSubmitting: Boolean = false,
    val archiveError: String? = null,
    val streamReconnecting: Boolean = false,
    val pendingPermissions: List<PermissionRequest> = emptyList(),
    val permissionUiState: PermissionUiState = PermissionUiState(),
    val notificationPermissionDenied: Boolean = false,
) {
    val activePermissionRequest: PermissionRequest?
        get() = activePermissionRequest(pendingPermissions)

    val effectiveSessionState: SessionState?
        get() = resolveEffectiveSessionState(
            sessionId = selectedSession?.id.orEmpty(),
            transcriptSessionState = transcript.sessionState,
            listSessionState = selectedSession?.state,
        )

    val composerEnabled: Boolean
        get() {
            val session = selectedSession ?: return false
            return isComposerPromptable(
                workspaceId = session.workspaceId,
                agentId = session.agentId,
                sessionId = session.id,
                sessionState = effectiveSessionState,
            ) && !composerSubmitting && !streamReconnecting
        }

    val composerBlockedMessage: String?
        get() = composerBlockedMessage(effectiveSessionState)

    val showComposerCancel: Boolean
        get() = showComposerCancel(effectiveSessionState) && !cancelSubmitting

    val sessionProgressMessage: String?
        get() = sessionProgressMessage(effectiveSessionState)

    val showProgress: Boolean
        get() = sessionProgressMessage != null

    val emptyTranscriptMessage: String?
        get() = when {
            selectedSession == null -> "Select a session to start chatting."
            transcript.rows.isEmpty() && !showProgress -> "Send a message to begin."
            else -> null
        }

    val showSelectSessionCta: Boolean
        get() = selectedSession == null && !sessionsLoading
}
