package server.agent.android.chat

import server.agent.android.contracts.AgentId
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.WorkspaceState

data class SessionRow(
    val id: String,
    val name: String,
    val workspaceLabel: String,
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

data class ChatUiState(
    val connectionBanner: String? = null,
    val selectedSession: SessionRow? = null,
    val sessions: List<SessionRow> = emptyList(),
    val sessionsLoading: Boolean = false,
    val sessionsError: String? = null,
    val pickerVisible: Boolean = false,
    val createDialogVisible: Boolean = false,
    val createState: CreateSessionUiState = CreateSessionUiState(),
    val placeholderMessage: String = "Streaming chat arrives in the next story.",
)
