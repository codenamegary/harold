package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.WorkspaceState
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SavedConnection
import harold.android.database.session.AgentRepository
import harold.android.database.session.CachedAgent
import harold.android.database.workspace.CachedWorkspace
import harold.android.database.workspace.WorkspaceRepository
import harold.android.navigation.CreatedWorkspaceResult
import harold.android.navigation.LastSessionSelection
import harold.android.navigation.Navigator
import harold.android.navigation.SessionPreferences
import harold.android.network.apiErrorMessage
import harold.android.session.ActiveConnectionState
import harold.android.session.ConnectionGateway
import harold.android.user.UserRepository
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class CreateSessionViewModel @Inject constructor(
    private val connectionGateway: ConnectionGateway,
    private val agentRepository: AgentRepository,
    private val workspaceRepository: WorkspaceRepository,
    private val userRepository: UserRepository,
    private val sessionCommands: SessionCommands,
    private val navigator: Navigator,
    private val sessionPreferences: SessionPreferences,
    private val connectionRepository: ConnectionRepository? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(CreateSessionUiState())
    val uiState: StateFlow<CreateSessionUiState> = _uiState.asStateFlow()

    private var agentsJob: Job? = null
    private var agentsOrigin: String? = null
    private var workspaceJob: Job? = null
    private var savedConnections: List<SavedConnection> = emptyList()
    private var activeOrigin: String? = null
    private var pendingCreatedWorkspace: CreatedWorkspaceResult? = null
    private var rememberedSelection: LastSessionSelection? = null

    init {
        viewModelScope.launch {
            loadConnectionMetadata()
            // The first Room emission must already know the remembered connection,
            // otherwise the first workspace wins before the value arrives.
            rememberedSelection = sessionPreferences.loadLastSessionSelection()
            observeWorkspaces()
            refreshWorkspaces()
        }
        viewModelScope.launch {
            navigator.workspaceCreated.collect(::selectCreatedWorkspace)
        }
    }

    fun openNewWorkspace() {
        val selectedOrigin = _uiState.value.workspaces
            .firstOrNull { row -> row.id == _uiState.value.selectedWorkspaceId }
            ?.connectionId
            .orEmpty()
        navigator.openAddWorkspace(preferredConnectionId = selectedOrigin)
    }

    fun onWorkspaceChanged(workspaceId: String) {
        val workspace = _uiState.value.workspaces.firstOrNull { row -> row.id == workspaceId }
        _uiState.update { current ->
            current.copy(
                selectedWorkspaceId = workspaceId,
                error = null,
                agents = if (workspace?.connectionId.isNullOrEmpty()) current.agents else emptyList(),
                selectedAgentId = if (workspace?.connectionId.isNullOrEmpty()) current.selectedAgentId else null,
            )
        }
        if (workspace == null || workspace.connectionId.isEmpty()) {
            return
        }
        viewModelScope.launch {
            loadAgents(workspace)
        }
    }

    fun onAgentChanged(agentId: AgentId) {
        _uiState.update { current ->
            current.copy(selectedAgentId = agentId, error = null)
        }
    }

    fun submit() {
        val createState = _uiState.value
        val workspaceId = createState.selectedWorkspaceId
        val agentId = createState.selectedAgentId
        val workspace = createState.workspaces.firstOrNull { row -> row.id == workspaceId }

        if (workspaceId.isEmpty() || workspace == null) {
            _uiState.update { current -> current.copy(error = "Choose a workspace") }
            return
        }

        if (agentId == null) {
            if (_uiState.value.error == null) {
                _uiState.update { current -> current.copy(error = "Choose an agent") }
            }
            return
        }

        val active = connectionGateway.activeConnection.value as? ActiveConnectionState.Active
        val origin = workspace.connectionId.ifEmpty { active?.connectionId }
        if (origin == null) {
            _uiState.update { current -> current.copy(error = "Connect to Harold first") }
            return
        }

        _uiState.update { current -> current.copy(submitting = true, error = null) }

        // Config options only exist once the agent has a session, so create it
        // on confirm for the selectors to render before the first prompt.
        viewModelScope.launch {
            val result = userRepository.createSession(
                connectionId = origin,
                body = CreateSessionBody(
                    agentId = agentId,
                    cwd = workspace.path,
                ),
            )

            result.fold(
                onSuccess = { created ->
                    sessionCommands.emit(
                        SessionCommand.Created(
                            response = created,
                            connectionId = origin,
                            connectionName = workspace.connectionName,
                            connectionColorId = workspace.connectionColorId,
                            connectionIconId = workspace.connectionIconId,
                        ),
                    )
                    navigator.goBack()
                },
                onFailure = { error ->
                    if (agentNeedsLogin(origin, agentId)) {
                        sessionCommands.emit(SessionCommand.Pending(workspace, agentId))
                        navigator.goBack()
                        return@fold
                    }
                    _uiState.update { current ->
                        current.copy(submitting = false, error = apiErrorMessage(error))
                    }
                },
            )
        }
    }

    private suspend fun loadConnectionMetadata() {
        savedConnections = connectionRepository?.list().orEmpty()
        activeOrigin = (connectionGateway.activeConnection.value as? ActiveConnectionState.Active)?.connectionId
    }

    private fun observeWorkspaces() {
        workspaceJob?.cancel()
        workspaceJob = viewModelScope.launch {
            workspaceRepository.observe().collect(::applyCachedWorkspaces)
        }
    }

    private suspend fun refreshWorkspaces() {
        targetOrigins().forEach { connectionId ->
            workspaceRepository.refresh(connectionId)
        }
    }

    private fun applyCachedWorkspaces(cached: List<CachedWorkspace>) {
        val origins = targetOrigins()
        val savedByOrigin = savedConnections.associateBy { connection -> connection.connectionId }
        val scoped = savedConnections.isNotEmpty()
        val rows = cached
            .filter { workspace -> workspace.connectionId in origins }
            .mapNotNull { cachedWorkspace ->
                val workspace = cachedWorkspace.workspace
                if (workspace.state != WorkspaceState.Available) {
                    return@mapNotNull null
                }
                val connection = savedByOrigin[cachedWorkspace.connectionId]
                workspace.toWorkspaceRow().copy(
                    id = if (scoped) {
                        "${cachedWorkspace.connectionId}|${workspace.id}"
                    } else {
                        workspace.id
                    },
                    connectionId = cachedWorkspace.connectionId,
                    connectionName = connection?.name.orEmpty(),
                    connectionColorId = connection?.colorId.orEmpty(),
                    connectionIconId = connection?.iconId.orEmpty(),
                )
            }

        val current = _uiState.value
        val pendingId = pendingCreatedWorkspace?.let { created ->
            workspaceId(created.connectionId, created.workspaceId)
        }
        val pendingRow = pendingId?.let { id -> rows.firstOrNull { row -> row.id == id } }
        val explicitRow = rows.firstOrNull { row -> row.id == current.selectedWorkspaceId }
        val rememberedRow = rememberedSelection?.let { remembered ->
            val rememberedId = workspaceId(remembered.connectionId, remembered.workspaceId)
            rows.firstOrNull { row -> row.id == rememberedId }
        }
        val defaultRow = rows.firstOrNull { row ->
            row.connectionId == defaultWorkspaceOrigin() &&
                row.path == defaultWorkspacePath()
        }
        val selected = pendingRow ?: explicitRow ?: rememberedRow ?: defaultRow ?: rows.firstOrNull()
        val agentsForSelection = selected != null && selected.connectionId == agentsOrigin

        _uiState.update { state ->
            state.copy(
                workspaces = rows,
                selectedWorkspaceId = selected?.id.orEmpty(),
                agents = if (agentsForSelection) state.agents else emptyList(),
                selectedAgentId = if (agentsForSelection) state.selectedAgentId else null,
            )
        }
        if (selected != null && selected.connectionId.isNotEmpty() && !agentsForSelection) {
            loadAgents(selected)
        }
        if (selected != null && selected.id == pendingId) {
            pendingCreatedWorkspace = null
        }
    }

    private fun selectCreatedWorkspace(result: CreatedWorkspaceResult) {
        pendingCreatedWorkspace = result
        val targetId = workspaceId(result.connectionId, result.workspaceId)
        val workspace = _uiState.value.workspaces.firstOrNull { row ->
            row.id == targetId ||
                (row.connectionId == result.connectionId && row.id == result.workspaceId)
        }
        if (workspace == null) {
            return
        }
        pendingCreatedWorkspace = null
        selectWorkspace(workspace)
    }

    private fun selectWorkspace(workspace: WorkspaceRow) {
        val sameOrigin = workspace.connectionId == agentsOrigin &&
            _uiState.value.agents.isNotEmpty()
        _uiState.update { current ->
            current.copy(
                selectedWorkspaceId = workspace.id,
                error = null,
                agents = if (sameOrigin) current.agents else emptyList(),
                selectedAgentId = if (sameOrigin) current.selectedAgentId else null,
            )
        }
        if (!sameOrigin) {
            loadAgents(workspace)
        }
    }

    private fun targetOrigins(): List<String> =
        if (savedConnections.isNotEmpty()) {
            savedConnections.map { connection -> connection.connectionId }.distinct()
        } else {
            listOfNotNull(activeOrigin)
        }

    private fun workspaceId(connectionId: String, workspaceId: String): String =
        if (savedConnections.isNotEmpty()) {
            "$connectionId|$workspaceId"
        } else {
            workspaceId
        }

    private fun loadAgents(workspace: WorkspaceRow) {
        val origin = workspace.connectionId.ifEmpty { return }
        observeAgents(origin)
        viewModelScope.launch {
            agentRepository.refreshAgents(origin).onFailure { error ->
                if (agentsOrigin == origin && _uiState.value.agents.isEmpty()) {
                    _uiState.update { current ->
                        current.copy(
                            agents = emptyList(),
                            selectedAgentId = null,
                            submitting = false,
                            error = apiErrorMessage(error),
                        )
                    }
                }
            }
        }
    }

    private fun observeAgents(connectionId: String) {
        if (agentsOrigin == connectionId && agentsJob != null) {
            return
        }
        agentsJob?.cancel()
        agentsOrigin = connectionId
        agentsJob = viewModelScope.launch {
            agentRepository.observeAgents(connectionId).collect { agents ->
                if (agentsOrigin == connectionId) {
                    applyAgents(agents)
                }
            }
        }
    }

    private fun applyAgents(cachedAgents: List<CachedAgent>) {
        val agents = cachedAgents
            .filter { agent -> agent.enabled }
            .map { agent -> AgentOption(id = agent.agentId, displayName = agent.displayName) }
        val rememberedAgent = rememberedAgentForSelectedWorkspace()
            ?.takeIf { remembered -> agents.any { agent -> agent.id == remembered } }
        _uiState.update { current ->
            current.copy(
                agents = agents,
                selectedAgentId = current.selectedAgentId
                    ?.takeIf { selected -> agents.any { agent -> agent.id == selected } }
                    ?: rememberedAgent
                    ?: defaultAgentForSelectedWorkspace(agents)
                    ?: agents.firstOrNull()?.id,
                error = null,
            )
        }
    }

    /**
     * Device-local default workspace: the saved connection whose default the
     * user picked in connection settings, matched by host path.
     */
    private fun defaultWorkspacePath(): String? {
        val origin = _uiState.value.workspaces
            .firstOrNull { row -> row.connectionId == defaultWorkspaceOrigin() }
            ?.connectionId
            ?: return null
        return savedConnections
            .find { connection -> connection.connectionId == origin }
            ?.defaultWorkspacePath
    }

    private fun defaultWorkspaceOrigin(): String? =
        savedConnections
            .firstOrNull { connection -> !connection.defaultWorkspacePath.isNullOrBlank() }
            ?.connectionId

    private fun defaultAgentForSelectedWorkspace(agents: List<AgentOption>): AgentId? {
        val origin = _uiState.value.workspaces
            .firstOrNull { row -> row.id == _uiState.value.selectedWorkspaceId }
            ?.connectionId
            ?: return null
        val default = savedConnections
            .find { connection -> connection.connectionId == origin }
            ?.defaultAgentId
            ?: return null
        return default.takeIf { id -> agents.any { agent -> agent.id == id } }
    }

    private fun rememberedAgentForSelectedWorkspace(): AgentId? {
        val remembered = rememberedSelection ?: return null
        val selected = _uiState.value.workspaces
            .firstOrNull { row -> row.id == _uiState.value.selectedWorkspaceId }
            ?: return null
        val rememberedId = workspaceId(remembered.connectionId, remembered.workspaceId)
        return remembered.agentId.takeIf { selected.id == rememberedId }
    }

    private suspend fun agentNeedsLogin(connectionId: String, agentId: AgentId): Boolean =
        userRepository.getAgentAuth(connectionId = connectionId, agentId = agentId)
            .getOrNull()
            ?.status == AgentAuthStatus.NeedsAuth
}
