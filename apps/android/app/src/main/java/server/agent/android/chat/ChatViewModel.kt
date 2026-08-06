package server.agent.android.chat

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import server.agent.android.connection.ConnectionGateway
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.EventEnvelope
import server.agent.android.contracts.PromptSessionBody
import server.agent.android.contracts.Session
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.WorkspaceState
import server.agent.android.events.ConnectionStatus
import server.agent.android.events.EventStreamFactory
import server.agent.android.navigation.NavigationPreferences
import server.agent.android.network.AgentApiError
import server.agent.android.network.AgentApiException
import server.agent.android.operator.OperatorRepository
import server.agent.android.session.PairedState
import server.agent.android.session.SessionGateway

class ChatViewModel(
    private val savedStateHandle: SavedStateHandle,
    private val sessionGateway: SessionGateway,
    private val connectionGateway: ConnectionGateway,
    private val operatorRepository: OperatorRepository,
    private val     navigationPreferences: NavigationPreferences,
    eventStreamFactory: EventStreamFactory,
    sessionEventSource: SessionEventSource? = null,
) : ViewModel() {
    private val sessionChatStream: SessionEventSource = sessionEventSource ?: SessionChatStream(
        streamFactory = eventStreamFactory,
        scope = viewModelScope,
    )
    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private var streamJob: Job? = null
    private var activeSessionId: String? = null

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
                } else {
                    stopSessionStream()
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

    fun onCreateAgentChanged(agentId: AgentId) {
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

    fun onComposerTextChanged(text: String) {
        _uiState.update { current ->
            current.copy(composerText = text, composerError = null)
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

    fun submitComposerPrompt() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        val session = _uiState.value.selectedSession ?: return
        val prompt = _uiState.value.composerText.trim()

        if (prompt.isEmpty() || !_uiState.value.composerEnabled) {
            return
        }

        _uiState.update { current ->
            current.copy(composerSubmitting = true, composerError = null)
        }

        viewModelScope.launch {
            operatorRepository.promptSession(
                serverOrigin = paired.serverOrigin,
                sessionId = session.id,
                body = PromptSessionBody(text = prompt),
            ).fold(
                onSuccess = {
                    _uiState.update { current ->
                        current.copy(
                            composerText = "",
                            composerSubmitting = false,
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            composerSubmitting = false,
                            composerError = errorMessage(error),
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
                val selected = row.copy(
                    name = session.name,
                    state = session.state,
                )
                _uiState.update { current ->
                    current.copy(
                        selectedSession = selected,
                        pickerVisible = false,
                        transcript = emptyTranscript,
                        composerText = "",
                        composerError = null,
                        streamReconnecting = false,
                    )
                }
                startSessionStream(serverOrigin, session.id)
            },
            onFailure = { error ->
                _uiState.update { current ->
                    current.copy(sessionsError = errorMessage(error))
                }
            },
        )
    }

    private fun startSessionStream(serverOrigin: String, sessionId: String) {
        if (activeSessionId == sessionId && streamJob?.isActive == true) {
            return
        }

        stopSessionStream()
        activeSessionId = sessionId

        streamJob = sessionChatStream.observe(
            serverOrigin = serverOrigin,
            sessionId = sessionId,
            onReconnect = {
                _uiState.update { current ->
                    current.copy(
                        transcript = emptyTranscript,
                        streamReconnecting = true,
                    )
                }
            },
            onEvents = { frame -> applySessionEvents(sessionId, frame) },
        )
    }

    private fun applySessionEvents(sessionId: String, frame: List<EventEnvelope>) {
        _uiState.update { current ->
            val nextTranscript = foldTranscriptEvents(
                state = current.transcript,
                events = frame,
                sessionId = sessionId,
            )
            val nextSessionState = resolveEffectiveSessionState(
                sessionId = sessionId,
                transcriptSessionState = nextTranscript.sessionState,
                listSessionState = current.selectedSession?.state,
            )

            current.copy(
                transcript = nextTranscript,
                streamReconnecting = false,
                selectedSession = current.selectedSession?.let { session ->
                    nextSessionState?.let { session.copy(state = it) } ?: session
                },
            )
        }
    }

    private fun stopSessionStream() {
        streamJob?.cancel()
        streamJob = null
        activeSessionId = null
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
        if (activeSessionId == row.id && streamJob?.isActive == true) {
            return
        }
        selectSession(serverOrigin, row)
    }

    private suspend fun selectSessionLocally(sessionId: String) {
        val row = _uiState.value.sessions.firstOrNull { session -> session.id == sessionId }
            ?: SessionRow(
                id = sessionId,
                name = "Session",
                workspaceId = "",
                workspaceLabel = "",
                agentId = AgentId.Cursor,
                agentLabel = "",
                state = SessionState.Idle,
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
        agentLabels: Map<AgentId, String>,
    ): SessionRow = SessionRow(
        id = id,
        name = name,
        workspaceId = workspaceId,
        workspaceLabel = workspaceLabels[workspaceId] ?: workspaceId,
        agentId = agentId,
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

    override fun onCleared() {
        stopSessionStream()
        super.onCleared()
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
    private val eventStreamFactory: EventStreamFactory,
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
                eventStreamFactory = eventStreamFactory,
            ) as T
        }

        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
