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
import kotlinx.serialization.json.JsonObject
import server.agent.android.connection.ConnectionGateway
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.CreateSessionBody
import server.agent.android.contracts.Session
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.SessionStreamClientMessage
import server.agent.android.contracts.SessionStreamServerMessage
import server.agent.android.contracts.WorkspaceState
import server.agent.android.contracts.catalogSessionKey
import server.agent.android.events.ConnectionStatus
import server.agent.android.foreground.ActiveSessionSnapshot
import server.agent.android.foreground.ActiveSessionTracker
import server.agent.android.foreground.OpenSessionRequests
import server.agent.android.foreground.SessionForegroundCoordinator
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
    private val activeSessionTracker: ActiveSessionTracker? = null,
    private val sessionForegroundCoordinator: SessionForegroundCoordinator? = null,
    private val openSessionRequests: OpenSessionRequests? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private var workspaceByPath: Map<String, WorkspaceRow> = emptyMap()
    private var agentLabels: Map<AgentId, String> = emptyMap()
    private var pendingPrompt: String? = null
    private var turnSerial: Int = 0
    private var catalog: List<SessionRow> = emptyList()

    init {
        savedStateHandle.get<String>(KEY_SELECTED_SESSION_ID)?.let { sessionKey ->
            viewModelScope.launch {
                selectSessionLocally(sessionKey)
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
            connectionGateway.streamResets.collect {
                pendingPrompt = null
                _uiState.update { current ->
                    current.copy(
                        transcript = applyReconnect(),
                        pendingPermissions = emptyList(),
                        permissionUiState = PermissionUiState(),
                        extensionUiState = ExtensionUiState(),
                        streamReconnecting = true,
                    )
                }
                syncSelectedState(SessionState.Offline)
            }
        }

        viewModelScope.launch {
            connectionGateway.messages.collect(::applyStreamMessage)
        }

        viewModelScope.launch {
            sessionGateway.pairedState.collect { paired ->
                if (paired is PairedState.Paired) {
                    sessionForegroundCoordinator?.setServerOrigin(paired.serverOrigin)
                    _uiState.value.selectedSession?.let { selected ->
                        connectionGateway.setTarget(selected.agentId, selected.sessionId)
                    }
                    refreshCatalog()
                } else {
                    sessionForegroundCoordinator?.setServerOrigin(null)
                    connectionGateway.setTarget(null, null)
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

    fun onResume() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        sessionForegroundCoordinator?.setServerOrigin(paired.serverOrigin)
        viewModelScope.launch {
            refreshCatalog()
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
        _uiState.update { current ->
            current.copy(
                pickerVisible = true,
                recentSessionsLoading = true,
                recentSessionsError = null,
            )
        }
        viewModelScope.launch {
            refreshCatalog()
            publishDerivedSessionLists()
            _uiState.update { current ->
                current.copy(recentSessionsLoading = false)
            }
        }
    }

    fun hidePicker() {
        _uiState.update { current -> current.copy(pickerVisible = false) }
    }

    fun openSessionsList() {
        hidePicker()
        _uiState.update { current ->
            current.copy(
                sessionsListSearch = "",
                sessionsListError = null,
                sessionsListLoading = true,
            )
        }
        viewModelScope.launch {
            refreshCatalog()
            publishDerivedSessionLists()
            _uiState.update { current -> current.copy(sessionsListLoading = false) }
        }
    }

    fun onSessionsSearchChanged(query: String) {
        _uiState.update { current ->
            current.copy(sessionsListSearch = query)
        }
        publishDerivedSessionLists()
    }

    fun selectSessionFromList(row: SessionRow) {
        selectSession(row)
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
        val workspace = createState.workspaces.firstOrNull { row -> row.id == workspaceId }

        if (workspaceId.isEmpty() || workspace == null) {
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
                    agentId = agentId,
                    cwd = workspace.path,
                ),
            )

            result.fold(
                onSuccess = { created ->
                    pendingPrompt = prompt
                    hideCreateDialog()
                    refreshCatalog()
                    activateSession(created.toSessionRow())
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
        val session = _uiState.value.selectedSession ?: return
        val prompt = _uiState.value.composerText.trim()

        if (prompt.isEmpty() || !_uiState.value.composerEnabled) {
            return
        }

        val turnId = nextTurnId()
        _uiState.update { current ->
            current.copy(
                composerText = "",
                composerSubmitting = false,
                composerError = null,
                transcript = beginUserTurn(current.transcript, turnId, prompt),
            )
        }
        syncSelectedState(SessionState.Running)
        connectionGateway.send(
            SessionStreamClientMessage.Prompt(
                agentId = session.agentId,
                sessionId = session.sessionId,
                text = prompt,
            ),
        )
    }

    fun submitPermissionOption(optionId: String) {
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
                transcript = applyPermissionResolved(current.transcript),
                pendingPermissions = current.pendingPermissions.filterNot { item ->
                    item.id == active.id
                },
            )
        }
        syncSelectedState(SessionState.Running)
        connectionGateway.send(
            SessionStreamClientMessage.PermissionReply(
                requestId = active.id,
                optionId = optionId,
            ),
        )
        _uiState.update { current ->
            current.copy(permissionUiState = PermissionUiState())
        }
    }

    fun submitCancel() {
        val session = _uiState.value.selectedSession ?: return
        if (!_uiState.value.showComposerCancel) {
            return
        }

        _uiState.update { current ->
            current.copy(cancelSubmitting = true, cancelError = null)
        }
        connectionGateway.send(
            SessionStreamClientMessage.Cancel(
                agentId = session.agentId,
                sessionId = session.sessionId,
            ),
        )
        _uiState.update { current ->
            current.copy(cancelSubmitting = false)
        }
    }

    fun onExtensionReplyChanged(text: String) {
        _uiState.update { current ->
            current.copy(
                extensionUiState = current.extensionUiState.copy(
                    replyText = text,
                    error = null,
                ),
            )
        }
    }

    fun submitExtensionReply() {
        val request = _uiState.value.extensionUiState.request ?: return
        val parsed = runCatching {
            server.agent.android.contracts.AgentServerJson.parseToJsonElement(
                _uiState.value.extensionUiState.replyText,
            )
        }.getOrElse {
            _uiState.update { current ->
                current.copy(
                    extensionUiState = current.extensionUiState.copy(
                        error = "Result must be JSON.",
                    ),
                )
            }
            return
        }

        _uiState.update { current ->
            current.copy(extensionUiState = current.extensionUiState.copy(submitting = true))
        }
        connectionGateway.send(
            SessionStreamClientMessage.ExtensionReply(
                requestId = request.requestId,
                result = parsed,
            ),
        )
        _uiState.update { current ->
            current.copy(extensionUiState = ExtensionUiState())
        }
    }

    fun skipExtension() {
        val request = _uiState.value.extensionUiState.request ?: return
        connectionGateway.send(
            SessionStreamClientMessage.ExtensionReply(
                requestId = request.requestId,
                result = JsonObject(emptyMap()),
            ),
        )
        _uiState.update { current ->
            current.copy(extensionUiState = ExtensionUiState())
        }
    }

    fun deleteSession(row: SessionRow) {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        viewModelScope.launch {
            operatorRepository.deleteSession(
                serverOrigin = paired.serverOrigin,
                agentId = row.agentId,
                sessionId = row.sessionId,
            ).fold(
                onSuccess = {
                    dropSession(row)
                },
                onFailure = { error ->
                    _uiState.update { current ->
                        current.copy(sessionsError = errorMessage(error))
                    }
                },
            )
        }
    }

    fun selectSession(row: SessionRow) {
        pendingPrompt = null
        viewModelScope.launch {
            activateSession(row)
        }
    }

    private suspend fun activateSession(row: SessionRow) {
        navigationPreferences.saveLastSessionId(row.id)
        persistSelectedSession(row.id)
        _uiState.update { current ->
            current.copy(
                selectedSession = row,
                pickerVisible = false,
                transcript = emptyAcpTranscript,
                composerText = "",
                composerError = null,
                pendingPermissions = emptyList(),
                permissionUiState = PermissionUiState(),
                extensionUiState = ExtensionUiState(),
                streamReconnecting = false,
            )
        }
        connectionGateway.setTarget(row.agentId, row.sessionId)
        syncActiveSessionsFromUiState()
    }

    private fun applyStreamMessage(message: SessionStreamServerMessage) {
        val selected = _uiState.value.selectedSession

        when (message) {
            is SessionStreamServerMessage.SessionUpdate -> {
                if (!belongsToSelection(message.agentId, message.sessionId, selected)) {
                    return
                }
                _uiState.update { current ->
                    current.copy(
                        transcript = foldAcpUpdate(current.transcript, parseAcpUpdate(message.update)),
                        streamReconnecting = false,
                    )
                }
                syncSelectedState(_uiState.value.transcript.sessionState)
            }
            is SessionStreamServerMessage.Subscribed -> {
                if (!belongsToSelection(message.agentId, message.sessionId, selected)) {
                    return
                }
                _uiState.update { current ->
                    current.copy(
                        transcript = applySubscribed(current.transcript),
                        streamReconnecting = false,
                    )
                }
                val queued = pendingPrompt
                pendingPrompt = null
                if (queued != null) {
                    val turnId = nextTurnId()
                    _uiState.update { current ->
                        current.copy(transcript = beginUserTurn(current.transcript, turnId, queued))
                    }
                    connectionGateway.send(
                        SessionStreamClientMessage.Prompt(
                            agentId = message.agentId,
                            sessionId = message.sessionId,
                            text = queued,
                        ),
                    )
                }
                syncSelectedState(_uiState.value.transcript.sessionState)
            }
            is SessionStreamServerMessage.PromptComplete -> {
                if (!belongsToSelection(message.agentId, message.sessionId, selected)) {
                    return
                }
                _uiState.update { current ->
                    current.copy(transcript = applyPromptComplete(current.transcript))
                }
                syncSelectedState(SessionState.Idle)
            }
            is SessionStreamServerMessage.Cancelled -> {
                if (!belongsToSelection(message.agentId, message.sessionId, selected)) {
                    return
                }
                _uiState.update { current ->
                    current.copy(transcript = applyCancelled(current.transcript))
                }
                syncSelectedState(SessionState.Idle)
            }
            is SessionStreamServerMessage.PermissionRequest -> {
                if (!belongsToSelection(message.agentId, message.sessionId, selected)) {
                    return
                }
                val parsed = parseStreamPermission(
                    requestId = message.requestId,
                    sessionId = message.sessionId,
                    params = message.params,
                ) ?: return
                _uiState.update { current ->
                    current.copy(
                        pendingPermissions = listOf(parsed),
                        transcript = applyPermissionRequested(current.transcript),
                    )
                }
                syncSelectedState(SessionState.AwaitingPermission)
            }
            is SessionStreamServerMessage.ExtensionRequest -> {
                if (!belongsToSelection(message.agentId, message.sessionId, selected)) {
                    return
                }
                _uiState.update { current ->
                    current.copy(
                        extensionUiState = ExtensionUiState(
                            request = StreamExtension(
                                requestId = message.requestId,
                                method = message.method,
                                params = message.params,
                            ),
                        ),
                    )
                }
            }
            is SessionStreamServerMessage.Error -> {
                if (
                    message.sessionId != null &&
                    message.sessionId != selected?.sessionId
                ) {
                    return
                }
                _uiState.update { current ->
                    current.copy(transcript = applyStreamError(current.transcript))
                }
                syncSelectedState(SessionState.Error)
            }
        }
    }

    private fun belongsToSelection(
        agentId: AgentId,
        sessionId: String,
        selected: SessionRow?,
    ): Boolean = selected != null &&
        selected.agentId == agentId &&
        selected.sessionId == sessionId

    private suspend fun openSessionFromNotification(sessionId: String) {
        if (_uiState.value.selectedSession?.sessionId == sessionId) {
            return
        }
        val row = catalog.firstOrNull { session -> session.sessionId == sessionId } ?: return
        activateSession(row)
    }

    private suspend fun refreshCatalog() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        _uiState.update { current ->
            current.copy(sessionsLoading = true, sessionsError = null)
        }

        val workspacesResult = operatorRepository.listWorkspaces(paired.serverOrigin)
        val sessionsResult = operatorRepository.listSessions(paired.serverOrigin)
        val agentsResult = operatorRepository.listAgents(paired.serverOrigin)

        val workspaces = workspacesResult.getOrNull()?.items.orEmpty().map { workspace ->
            WorkspaceRow(
                id = workspace.id,
                name = workspace.name,
                path = workspace.path,
                state = workspace.state,
            )
        }
        workspaceByPath = workspaces.associateBy { workspace -> workspace.path }
        agentLabels = agentsResult.getOrNull()?.items.orEmpty()
            .associate { agent -> agent.id to agent.displayName }

        sessionsResult.fold(
            onSuccess = { collection ->
                catalog = collection.items.map { session -> session.toSessionRow() }
                _uiState.update { current ->
                    current.copy(
                        sessions = catalog,
                        sessionsLoading = false,
                        sessionsError = null,
                    )
                }
                publishDerivedSessionLists()
                syncActiveSessionsFromUiState()
                restoreLastSession()
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

    private fun publishDerivedSessionLists() {
        val search = _uiState.value.sessionsListSearch.trim()
        val recent = catalog
            .sortedByDescending { row -> row.updatedAt }
            .take(RECENT_SESSIONS_LIMIT)
        val list = if (search.isEmpty()) {
            catalog.sortedByDescending { row -> row.updatedAt }
        } else {
            catalog
                .filter { row -> row.name.contains(search, ignoreCase = true) }
                .sortedByDescending { row -> row.updatedAt }
        }
        _uiState.update { current ->
            current.copy(
                recentSessions = recent,
                sessionsList = list,
            )
        }
    }

    private suspend fun restoreLastSession() {
        val savedId = savedStateHandle.get<String>(KEY_SELECTED_SESSION_ID)
            ?: navigationPreferences.loadLastSessionId()
            ?: return

        val row = catalog.firstOrNull { session -> session.id == savedId }
            ?: catalog.firstOrNull { session -> session.sessionId == savedId }
            ?: return
        if (_uiState.value.selectedSession?.id == row.id) {
            connectionGateway.setTarget(row.agentId, row.sessionId)
            return
        }
        activateSession(row)
    }

    private suspend fun selectSessionLocally(sessionKey: String) {
        val row = catalog.firstOrNull { session -> session.id == sessionKey }
            ?: return
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

    private fun persistSelectedSession(sessionKey: String) {
        savedStateHandle[KEY_SELECTED_SESSION_ID] = sessionKey
    }

    private suspend fun clearPersistedSession() {
        savedStateHandle.remove<String>(KEY_SELECTED_SESSION_ID)
        navigationPreferences.clearLastSessionId()
    }

    private fun dropSession(row: SessionRow) {
        catalog = catalog.filterNot { item -> item.id == row.id }
        val selectedWasDeleted = _uiState.value.selectedSession?.id == row.id
        if (selectedWasDeleted) {
            connectionGateway.setTarget(null, null)
            viewModelScope.launch { clearPersistedSession() }
        }
        _uiState.update { current ->
            current.copy(
                sessions = catalog,
                selectedSession = if (selectedWasDeleted) null else current.selectedSession,
                transcript = if (selectedWasDeleted) emptyAcpTranscript else current.transcript,
                composerText = if (selectedWasDeleted) "" else current.composerText,
                pendingPermissions = if (selectedWasDeleted) emptyList() else current.pendingPermissions,
                permissionUiState = if (selectedWasDeleted) PermissionUiState() else current.permissionUiState,
                extensionUiState = if (selectedWasDeleted) ExtensionUiState() else current.extensionUiState,
                pickerVisible = false,
            )
        }
        publishDerivedSessionLists()
        syncActiveSessionsFromUiState()
    }

    private fun syncSelectedState(state: SessionState?) {
        if (state == null) {
            return
        }
        _uiState.update { current ->
            val selected = current.selectedSession ?: return@update current
            val next = selected.copy(state = state)
            catalog = catalog.map { row -> if (row.id == next.id) next else row }
            current.copy(
                selectedSession = next,
                sessions = catalog,
            )
        }
        publishDerivedSessionLists()
        syncActiveSessionsFromUiState()
    }

    private fun syncActiveSessionsFromUiState() {
        val tracker = activeSessionTracker ?: return
        tracker.replaceAll(
            catalog.map { row ->
                ActiveSessionSnapshot(id = row.sessionId, name = row.name, state = row.state)
            },
        )
        sessionForegroundCoordinator?.onSessionsChanged()
    }

    private fun Session.toSessionRow(): SessionRow {
        val workspace = workspaceByPath[cwd]
        return SessionRow(
            sessionId = sessionId,
            name = title.ifBlank { sessionId },
            cwd = cwd,
            workspaceId = workspace?.id.orEmpty(),
            workspaceLabel = workspace?.name ?: cwd,
            agentId = agentId,
            agentLabel = agentLabels[agentId] ?: agentId,
            state = SessionState.Idle,
            updatedAt = updatedAt,
        )
    }

    private fun nextTurnId(): String {
        turnSerial += 1
        return "turn-$turnSerial"
    }

    private fun errorMessage(error: Throwable): String =
        when (val apiError = (error as? AgentApiException)?.error) {
            is AgentApiError.Unauthorized -> apiError.detail ?: "Authentication required"
            is AgentApiError.Problem -> apiError.detail ?: apiError.title
            is AgentApiError.Decode -> "Unexpected response from Agent Server"
            is AgentApiError.Transport -> "Could not reach Agent Server"
            null -> error.message ?: "Request failed"
        }

    override fun onCleared() {
        connectionGateway.setTarget(null, null)
        super.onCleared()
    }

    companion object {
        const val KEY_SELECTED_SESSION_ID = "selected_session_id"
        const val RECENT_SESSIONS_LIMIT = 5
    }
}

class ChatViewModelFactory(
    private val savedStateHandle: SavedStateHandle,
    private val sessionGateway: SessionGateway,
    private val connectionGateway: ConnectionGateway,
    private val operatorRepository: OperatorRepository,
    private val navigationPreferences: NavigationPreferences,
    private val activeSessionTracker: ActiveSessionTracker,
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
                activeSessionTracker = activeSessionTracker,
                sessionForegroundCoordinator = sessionForegroundCoordinator,
                openSessionRequests = openSessionRequests,
            ) as T
        }

        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
