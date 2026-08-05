package server.agent.android.chat

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.Session
import server.agent.android.contracts.WorkspaceState
import server.agent.android.events.ConnectionStatus
import server.agent.android.navigation.NavigationPreferences
import server.agent.android.network.AgentApiError
import server.agent.android.network.AgentApiException
import server.agent.android.operator.OperatorRepository
import server.agent.android.session.PairedState
import server.agent.android.session.SessionGateway
import server.agent.android.connection.ConnectionGateway

class ChatViewModel(
    private val savedStateHandle: SavedStateHandle,
    private val sessionGateway: SessionGateway,
    private val connectionGateway: ConnectionGateway,
    private val operatorRepository: OperatorRepository,
    private val navigationPreferences: NavigationPreferences,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    init {
        savedStateHandle.get<String>(KEY_SELECTED_SESSION_ID)?.let { sessionId ->
            viewModelScope.launch {
                selectSessionLocally(sessionId)
            }
        }

        viewModelScope.launch {
            connectionGateway.state.collect { state ->
                val banner = when (val status = state.status) {
                    ConnectionStatus.Idle -> null
                    ConnectionStatus.Connecting -> "Connecting…"
                    ConnectionStatus.Live -> null
                    is ConnectionStatus.Reconnecting -> "Reconnecting (attempt ${status.attempt})"
                    is ConnectionStatus.AuthFailed -> "Auth failed"
                    is ConnectionStatus.TransportError -> status.message
                }
                _uiState.update { current -> current.copy(connectionBanner = banner) }
            }
        }

        viewModelScope.launch {
            sessionGateway.pairedState.collect { paired ->
                if (paired is PairedState.Paired) {
                    refreshOperatorData(paired.serverOrigin)
                }
            }
        }
    }

    fun showPicker() {
        _uiState.update { current -> current.copy(pickerVisible = true) }
    }

    fun hidePicker() {
        _uiState.update { current -> current.copy(pickerVisible = false) }
    }

    fun showCreateDialog() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        _uiState.update { current -> current.copy(createDialogVisible = true) }

        viewModelScope.launch {
            val createState = loadCreateForm(paired.serverOrigin)
            _uiState.update { current ->
                current.copy(createState = createState)
            }
        }
    }

    fun hideCreateDialog() {
        _uiState.update { current ->
            current.copy(
                createDialogVisible = false,
                createState = CreateSessionUiState(),
            )
        }
    }

    fun onCreateWorkspaceChanged(workspaceId: String) {
        _uiState.update { current ->
            current.copy(
                createState = current.createState.copy(
                    selectedWorkspaceId = workspaceId,
                    error = null,
                ),
            )
        }
    }

    fun onCreateAgentChanged(agentId: server.agent.android.contracts.AgentId) {
        _uiState.update { current ->
            current.copy(
                createState = current.createState.copy(
                    selectedAgentId = agentId,
                    error = null,
                ),
            )
        }
    }

    fun onCreatePromptChanged(prompt: String) {
        _uiState.update { current ->
            current.copy(
                createState = current.createState.copy(
                    prompt = prompt,
                    error = null,
                ),
            )
        }
    }

    fun submitCreateSession() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        val createState = _uiState.value.createState
        val workspaceId = createState.selectedWorkspaceId
        val agentId = createState.selectedAgentId
        val prompt = createState.prompt.trim()

        if (workspaceId.isEmpty()) {
            _uiState.update { current ->
                current.copy(createState = current.createState.copy(error = "Choose a workspace"))
            }
            return
        }

        if (agentId == null) {
            _uiState.update { current ->
                current.copy(createState = current.createState.copy(error = "Choose an agent"))
            }
            return
        }

        if (prompt.isEmpty()) {
            _uiState.update { current ->
                current.copy(createState = current.createState.copy(error = "Enter an initial prompt"))
            }
            return
        }

        _uiState.update { current ->
            current.copy(createState = current.createState.copy(submitting = true, error = null))
        }

        viewModelScope.launch {
            val result = operatorRepository.createSession(
                serverOrigin = paired.serverOrigin,
                body = CreateSessionBody(
                    workspaceId = workspaceId,
                    agentId = agentId,
                    text = prompt,
                ),
            )

            result.fold(
                onSuccess = { created ->
                    navigationPreferences.saveLastSessionId(created.id)
                    persistSelectedSession(created.id)
                    hideCreateDialog()
                    refreshOperatorData(paired.serverOrigin)
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            createState = current.createState.copy(
                                submitting = false,
                                error = errorMessage(error),
                            ),
                        )
                    }
                },
            )
        }
    }

    fun selectSession(row: SessionRow) {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        viewModelScope.launch {
            selectSession(paired.serverOrigin, row)
        }
    }

    private suspend fun selectSession(serverOrigin: String, row: SessionRow) {
        operatorRepository.selectSession(serverOrigin, row.id).fold(
            onSuccess = { session ->
                navigationPreferences.saveLastSessionId(session.id)
                persistSelectedSession(session.id)
                _uiState.update { current ->
                    current.copy(
                        selectedSession = row.copy(
                            name = session.name,
                            state = session.state,
                        ),
                        pickerVisible = false,
                    )
                }
            },
            onFailure = { error ->
                _uiState.update { current ->
                    current.copy(sessionsError = errorMessage(error))
                }
            },
        )
    }

    private suspend fun refreshOperatorData(serverOrigin: String) {
        _uiState.update { current ->
            current.copy(sessionsLoading = true, sessionsError = null)
        }

        val workspacesResult = operatorRepository.listWorkspaces(serverOrigin)
        val sessionsResult = operatorRepository.listSessions(serverOrigin)
        val agentsResult = operatorRepository.listAgents(serverOrigin)

        val workspaces = workspacesResult.getOrNull()?.items.orEmpty()
        val workspaceLabels = workspaces.associate { workspace -> workspace.id to workspace.name }
        val agentLabels = agentsResult.getOrNull()?.items.orEmpty()
            .associate { agent -> agent.id to agent.displayName }

        sessionsResult.fold(
            onSuccess = { collection ->
                val rows = collection.items.map { session ->
                    session.toSessionRow(workspaceLabels, agentLabels)
                }
                _uiState.update { current ->
                    current.copy(
                        sessions = rows,
                        sessionsLoading = false,
                        sessionsError = null,
                    )
                }

                restoreLastSession(serverOrigin, rows)
            },
            onFailure = { error ->
                _uiState.update { current ->
                    current.copy(
                        sessionsLoading = false,
                        sessionsError = errorMessage(error),
                    )
                }
            },
        )
    }

    private suspend fun restoreLastSession(
        serverOrigin: String,
        rows: List<SessionRow>,
    ) {
        val savedId = savedStateHandle.get<String>(KEY_SELECTED_SESSION_ID)
            ?: navigationPreferences.loadLastSessionId()
            ?: return

        val row = rows.firstOrNull { session -> session.id == savedId } ?: return
        selectSession(serverOrigin, row)
    }

    private suspend fun selectSessionLocally(sessionId: String) {
        val row = _uiState.value.sessions.firstOrNull { session -> session.id == sessionId }
            ?: SessionRow(
                id = sessionId,
                name = "Session",
                workspaceLabel = "",
                agentLabel = "",
                state = server.agent.android.contracts.SessionState.Idle,
            )

        _uiState.update { current -> current.copy(selectedSession = row) }
    }

    private suspend fun loadCreateForm(serverOrigin: String): CreateSessionUiState {
        val workspaces = operatorRepository.listWorkspaces(serverOrigin).getOrNull()?.items.orEmpty()
            .map { workspace ->
                WorkspaceRow(
                    id = workspace.id,
                    name = workspace.name,
                    path = workspace.path,
                    state = workspace.state,
                )
            }
            .filter { workspace -> workspace.state == WorkspaceState.Available }

        val agents = operatorRepository.listAgents(serverOrigin).getOrNull()?.items.orEmpty()
            .filter { agent -> agent.enabled }
            .map { agent -> AgentOption(id = agent.id, displayName = agent.displayName) }

        return CreateSessionUiState(
            workspaces = workspaces,
            agents = agents,
            selectedWorkspaceId = workspaces.firstOrNull()?.id.orEmpty(),
            selectedAgentId = agents.firstOrNull()?.id,
        )
    }

    private fun persistSelectedSession(sessionId: String) {
        savedStateHandle[KEY_SELECTED_SESSION_ID] = sessionId
    }

    private fun Session.toSessionRow(
        workspaceLabels: Map<String, String>,
        agentLabels: Map<server.agent.android.contracts.AgentId, String>,
    ): SessionRow = SessionRow(
        id = id,
        name = name,
        workspaceLabel = workspaceLabels[workspaceId] ?: workspaceId,
        agentLabel = agentLabels[agentId] ?: agentId.name,
        state = state,
    )

    private fun errorMessage(error: Throwable): String =
        when (val apiError = (error as? AgentApiException)?.error) {
            is AgentApiError.Unauthorized -> apiError.detail ?: "Authentication required"
            is AgentApiError.Problem -> apiError.detail ?: apiError.title
            is AgentApiError.Decode -> "Unexpected response from Agent Server"
            is AgentApiError.Transport -> "Could not reach Agent Server"
            null -> error.message ?: "Request failed"
        }

    companion object {
        const val KEY_SELECTED_SESSION_ID = "selected_session_id"
    }
}

class ChatViewModelFactory(
    private val savedStateHandle: SavedStateHandle,
    private val sessionGateway: SessionGateway,
    private val connectionGateway: ConnectionGateway,
    private val operatorRepository: OperatorRepository,
    private val navigationPreferences: NavigationPreferences,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(ChatViewModel::class.java)) {
            return ChatViewModel(
                savedStateHandle = savedStateHandle,
                sessionGateway = sessionGateway,
                connectionGateway = connectionGateway,
                operatorRepository = operatorRepository,
                navigationPreferences = navigationPreferences,
            ) as T
        }

        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
