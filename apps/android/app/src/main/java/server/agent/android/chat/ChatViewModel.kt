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
import server.agent.android.contracts.UpdateSessionBody
import server.agent.android.contracts.WorkspaceState
import server.agent.android.events.ConnectionStatus
import server.agent.android.events.EventStreamFactory
import server.agent.android.foreground.ActiveSessionSnapshot
import server.agent.android.foreground.ActiveSessionTracker
import server.agent.android.foreground.OpenSessionRequests
import server.agent.android.foreground.SessionForegroundCoordinator
import server.agent.android.foreground.SessionStreamBroker
import server.agent.android.foreground.StreamPinReason
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
    private val navigationPreferences: NavigationPreferences,
    eventStreamFactory: EventStreamFactory,
    sessionEventSource: SessionEventSource? = null,
    private val activeSessionTracker: ActiveSessionTracker? = null,
    private val sessionStreamBroker: SessionStreamBroker? = null,
    private val sessionForegroundCoordinator: SessionForegroundCoordinator? = null,
    private val openSessionRequests: OpenSessionRequests? = null,
) : ViewModel() {
    private val sessionChatStream: SessionEventSource = sessionEventSource ?: SessionChatStream(
        streamFactory = eventStreamFactory,
        scope = viewModelScope,
    )
    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private var streamJob: Job? = null
    private var frameCollectJob: Job? = null
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
                    sessionForegroundCoordinator?.setServerOrigin(paired.serverOrigin)
                    refreshOperatorData(paired.serverOrigin)
                } else {
                    sessionForegroundCoordinator?.setServerOrigin(null)
                    stopSessionStream()
                }
            }
        }

        sessionForegroundCoordinator?.let { coordinator ->
            viewModelScope.launch {
                coordinator.state.collect { foreground ->
                    _uiState.update { current ->
                        current.copy(notificationPermissionDenied = foreground.permissionDenied)
                    }
                }
            }
        }

        openSessionRequests?.let { requests ->
            viewModelScope.launch {
                requests.sessionIds.collect { sessionId ->
                    openSessionFromNotification(sessionId)
                }
            }
        }
    }

    fun dismissNotificationPermissionPrompt() {
        sessionForegroundCoordinator?.dismissPermissionPrompt()
        _uiState.update { current -> current.copy(notificationPermissionDenied = false) }
    }

    fun onNotificationPermissionResult(granted: Boolean) {
        sessionForegroundCoordinator?.onPermissionMaybeChanged()
        if (!granted) {
            _uiState.update { current -> current.copy(notificationPermissionDenied = true) }
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

    fun submitPermissionOption(optionId: String) {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        val session = _uiState.value.selectedSession ?: return
        val active = _uiState.value.activePermissionRequest ?: return

        if (_uiState.value.permissionUiState.submittingOptionId != null) {
            return
        }

        _uiState.update { current ->
            current.copy(
                permissionUiState = current.permissionUiState.copy(
                    submittingOptionId = optionId,
                    error = null,
                ),
            )
        }

        viewModelScope.launch {
            operatorRepository.resolvePermission(
                serverOrigin = paired.serverOrigin,
                sessionId = session.id,
                requestId = active.id,
                optionId = optionId,
            ).fold(
                onSuccess = {
                    _uiState.update { current ->
                        current.copy(permissionUiState = PermissionUiState())
                    }
                },
                onFailure = { error ->
                    val apiError = (error as? AgentApiException)?.error
                    val shouldRefresh = apiError is AgentApiError.Problem && apiError.status == HTTP_CONFLICT

                    if (shouldRefresh) {
                        refreshPendingPermissions(
                            serverOrigin = paired.serverOrigin,
                            sessionId = session.id,
                            authoritative = true,
                        )
                    }

                    _uiState.update { current ->
                        current.copy(
                            permissionUiState = current.permissionUiState.copy(
                                submittingOptionId = null,
                                error = errorMessage(error),
                            ),
                        )
                    }
                },
            )
        }
    }

    fun submitCancel() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        val session = _uiState.value.selectedSession ?: return

        if (!_uiState.value.showComposerCancel) {
            return
        }

        _uiState.update { current ->
            current.copy(cancelSubmitting = true, cancelError = null)
        }

        viewModelScope.launch {
            operatorRepository.cancelSession(
                serverOrigin = paired.serverOrigin,
                sessionId = session.id,
            ).fold(
                onSuccess = {
                    _uiState.update { current ->
                        current.copy(cancelSubmitting = false)
                    }
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            cancelSubmitting = false,
                            cancelError = errorMessage(error),
                        )
                    }
                },
            )
        }
    }

    fun showRenameDialog() {
        val session = _uiState.value.selectedSession ?: return
        showRenameDialogForSession(session)
    }

    fun showRenameDialogForSession(row: SessionRow) {
        _uiState.update { current ->
            current.copy(
                renameDialogVisible = true,
                renameState = RenameSessionUiState(
                    sessionId = row.id,
                    name = row.name,
                ),
            )
        }
    }

    fun hideRenameDialog() {
        _uiState.update { current ->
            current.copy(
                renameDialogVisible = false,
                renameState = RenameSessionUiState(),
            )
        }
    }

    fun onRenameNameChanged(name: String) {
        _uiState.update { current ->
            current.copy(
                renameState = current.renameState.copy(
                    name = name,
                    error = null,
                ),
            )
        }
    }

    fun submitRename() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        val renameState = _uiState.value.renameState
        val name = renameState.name.trim()

        if (name.isEmpty()) {
            _uiState.update { current ->
                current.copy(renameState = current.renameState.copy(error = "Enter a session name"))
            }
            return
        }

        if (name.length > SESSION_NAME_MAX_LENGTH) {
            _uiState.update { current ->
                current.copy(
                    renameState = current.renameState.copy(
                        error = "Name must be $SESSION_NAME_MAX_LENGTH characters or fewer",
                    ),
                )
            }
            return
        }

        _uiState.update { current ->
            current.copy(renameState = current.renameState.copy(submitting = true, error = null))
        }

        viewModelScope.launch {
            operatorRepository.updateSession(
                serverOrigin = paired.serverOrigin,
                sessionId = renameState.sessionId,
                body = UpdateSessionBody(name = name),
            ).fold(
                onSuccess = { updated ->
                    _uiState.update { current ->
                        current.copy(
                            renameDialogVisible = false,
                            renameState = RenameSessionUiState(),
                            sessions = current.sessions.map { row ->
                                if (row.id == updated.id) {
                                    row.copy(name = updated.name)
                                } else {
                                    row
                                }
                            },
                            selectedSession = current.selectedSession?.let { selected ->
                                if (selected.id == updated.id) {
                                    selected.copy(name = updated.name)
                                } else {
                                    selected
                                }
                            },
                        )
                    }
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            renameState = current.renameState.copy(
                                submitting = false,
                                error = errorMessage(error),
                            ),
                        )
                    }
                },
            )
        }
    }

    fun showArchiveDialog() {
        _uiState.update { current ->
            current.copy(
                archiveDialogVisible = true,
                archiveError = null,
            )
        }
    }

    fun hideArchiveDialog() {
        _uiState.update { current ->
            current.copy(
                archiveDialogVisible = false,
                archiveSubmitting = false,
                archiveError = null,
            )
        }
    }

    fun submitArchive() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        val session = _uiState.value.selectedSession ?: return

        _uiState.update { current ->
            current.copy(archiveSubmitting = true, archiveError = null)
        }

        viewModelScope.launch {
            operatorRepository.archiveSession(
                serverOrigin = paired.serverOrigin,
                sessionId = session.id,
            ).fold(
                onSuccess = { archived ->
                    hideArchiveDialog()
                    removeSessionFromActiveWorkflow(sessionId = archived.id)
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(
                            archiveSubmitting = false,
                            archiveError = errorMessage(error),
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
                        pendingPermissions = emptyList(),
                        permissionUiState = PermissionUiState(),
                        streamReconnecting = false,
                    )
                }
                startSessionStream(serverOrigin, session.id)
                loadPendingPermissions(serverOrigin, session.id)
            },
            onFailure = { error ->
                _uiState.update { current ->
                    current.copy(sessionsError = errorMessage(error))
                }
            },
        )
    }

    private fun startSessionStream(serverOrigin: String, sessionId: String) {
        if (activeSessionId == sessionId && (streamJob?.isActive == true || frameCollectJob?.isActive == true)) {
            return
        }

        stopSessionStream()
        activeSessionId = sessionId

        val broker = sessionStreamBroker
        if (broker != null) {
            broker.pin(serverOrigin, sessionId, StreamPinReason.Ui)
            frameCollectJob = viewModelScope.launch {
                broker.frames.collect { frame ->
                    if (frame.sessionId != sessionId) {
                        return@collect
                    }
                    if (frame.reconnect) {
                        _uiState.update { current ->
                            current.copy(
                                transcript = emptyTranscript,
                                pendingPermissions = emptyList(),
                                permissionUiState = PermissionUiState(),
                                streamReconnecting = true,
                            )
                        }
                        refreshPendingPermissions(serverOrigin, sessionId)
                    } else {
                        applySessionEvents(sessionId, frame.events)
                    }
                }
            }
            return
        }

        streamJob = sessionChatStream.observe(
            serverOrigin = serverOrigin,
            sessionId = sessionId,
            onReconnect = {
                _uiState.update { current ->
                    current.copy(
                        transcript = emptyTranscript,
                        pendingPermissions = emptyList(),
                        permissionUiState = PermissionUiState(),
                        streamReconnecting = true,
                    )
                }
                viewModelScope.launch {
                    refreshPendingPermissions(serverOrigin, sessionId)
                }
            },
            onEvents = { frame -> applySessionEvents(sessionId, frame) },
        )
    }

    private fun applySessionEvents(sessionId: String, frame: List<EventEnvelope>) {
        _uiState.update { current ->
            val nextSessions = applySessionListStateEvents(current.sessions, frame)
            val nextTranscript = foldTranscriptEvents(
                state = current.transcript,
                events = frame,
                sessionId = sessionId,
            )
            val nextSessionState = resolveEffectiveSessionState(
                sessionId = sessionId,
                transcriptSessionState = nextTranscript.sessionState,
                listSessionState = nextSessions.firstOrNull { row -> row.id == sessionId }?.state
                    ?: current.selectedSession?.state,
            )

            val selectedStillActive = nextSessions.any { row -> row.id == sessionId }
            val nextSelected = when {
                current.selectedSession?.id != sessionId -> current.selectedSession
                !selectedStillActive -> null
                else -> current.selectedSession?.let { session ->
                    val listRow = nextSessions.first { row -> row.id == sessionId }
                    nextSessionState?.let { session.copy(state = it, name = listRow.name) }
                        ?: session.copy(name = listRow.name)
                }
            }

            val nextPending = applyPermissionEvents(current.pendingPermissions, frame)

            current.copy(
                sessions = nextSessions,
                transcript = nextTranscript,
                pendingPermissions = nextPending,
                streamReconnecting = false,
                selectedSession = nextSelected,
            )
        }

        syncActiveSessionsFromUiState()

        if (_uiState.value.selectedSession == null && activeSessionId == sessionId) {
            viewModelScope.launch { clearPersistedSession() }
            stopSessionStream()
        }
    }

    private fun syncActiveSessionsFromUiState() {
        val tracker = activeSessionTracker ?: return
        val rows = _uiState.value.sessions
        tracker.replaceAll(
            rows.map { row ->
                ActiveSessionSnapshot(id = row.id, name = row.name, state = row.state)
            },
        )
        sessionForegroundCoordinator?.onSessionsChanged()
    }

    private fun stopSessionStream() {
        streamJob?.cancel()
        streamJob = null
        frameCollectJob?.cancel()
        frameCollectJob = null
        val sessionId = activeSessionId
        activeSessionId = null
        if (sessionId != null) {
            sessionStreamBroker?.unpin(sessionId, StreamPinReason.Ui)
        }
    }

    private suspend fun openSessionFromNotification(sessionId: String) {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        if (_uiState.value.selectedSession?.id == sessionId) {
            return
        }

        val row = _uiState.value.sessions.firstOrNull { session -> session.id == sessionId } ?: return
        selectSession(paired.serverOrigin, row)
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
                val rows = collection.items
                    .filter { session -> session.state != SessionState.Archived }
                    .map { session ->
                        session.toSessionRow(workspaceLabels, agentLabels)
                    }
                _uiState.update { current ->
                    current.copy(
                        sessions = rows,
                        sessionsLoading = false,
                        sessionsError = null,
                    )
                }

                syncActiveSessionsFromUiState()
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

    private suspend fun clearPersistedSession() {
        savedStateHandle.remove<String>(KEY_SELECTED_SESSION_ID)
        navigationPreferences.clearLastSessionId()
    }

    private fun removeSessionFromActiveWorkflow(sessionId: String) {
        stopSessionStream()
        viewModelScope.launch {
            clearPersistedSession()
        }
        _uiState.update { current ->
            current.copy(
                sessions = current.sessions.filterNot { row -> row.id == sessionId },
                selectedSession = null,
                transcript = emptyTranscript,
                composerText = "",
                composerError = null,
                cancelError = null,
                pendingPermissions = emptyList(),
                permissionUiState = PermissionUiState(),
                pickerVisible = false,
            )
        }
    }

    private fun loadPendingPermissions(serverOrigin: String, sessionId: String) {
        viewModelScope.launch {
            operatorRepository.listPendingPermissions(serverOrigin, sessionId).fold(
                onSuccess = { items ->
                    _uiState.update { current ->
                        current.copy(pendingPermissions = items)
                    }
                },
                onFailure = {
                    _uiState.update { current ->
                        current.copy(pendingPermissions = emptyList())
                    }
                },
            )
        }
    }

    private suspend fun refreshPendingPermissions(
        serverOrigin: String,
        sessionId: String,
        authoritative: Boolean = false,
    ) {
        operatorRepository.listPendingPermissions(serverOrigin, sessionId).fold(
            onSuccess = { items ->
                _uiState.update { current ->
                    current.copy(
                        pendingPermissions = if (authoritative) {
                            items
                        } else {
                            mergePendingRead(current.pendingPermissions, items)
                        },
                        permissionUiState = PermissionUiState(),
                    )
                }
            },
            onFailure = {
                _uiState.update { current ->
                    current.copy(pendingPermissions = emptyList())
                }
            },
        )
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
        const val SESSION_NAME_MAX_LENGTH = 120
        private const val HTTP_CONFLICT = 409
    }
}

class ChatViewModelFactory(
    private val savedStateHandle: SavedStateHandle,
    private val sessionGateway: SessionGateway,
    private val connectionGateway: ConnectionGateway,
    private val operatorRepository: OperatorRepository,
    private val navigationPreferences: NavigationPreferences,
    private val eventStreamFactory: EventStreamFactory,
    private val activeSessionTracker: ActiveSessionTracker,
    private val sessionStreamBroker: SessionStreamBroker,
    private val sessionForegroundCoordinator: SessionForegroundCoordinator,
    private val openSessionRequests: OpenSessionRequests,
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
                activeSessionTracker = activeSessionTracker,
                sessionStreamBroker = sessionStreamBroker,
                sessionForegroundCoordinator = sessionForegroundCoordinator,
                openSessionRequests = openSessionRequests,
            ) as T
        }

        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
