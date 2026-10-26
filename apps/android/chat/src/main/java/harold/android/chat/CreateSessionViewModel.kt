package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.WorkspaceState
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.StoredCredential
import harold.android.database.session.CachedAgent
import harold.android.database.session.SessionRepository
import harold.android.database.workspace.CachedWorkspace
import harold.android.database.workspace.WorkspaceRepository
import harold.android.navigation.CreatedWorkspaceResult
import harold.android.navigation.Navigator
import harold.android.network.apiErrorMessage
import harold.android.session.PairedState
import harold.android.session.SessionGateway
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
    private val sessionGateway: SessionGateway,
    private val sessionRepository: SessionRepository,
    private val workspaceRepository: WorkspaceRepository,
    private val userRepository: UserRepository,
    private val sessionCommands: SessionCommands,
    private val navigator: Navigator,
    private val savedHaroldRepository: SavedHaroldRepository? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(CreateSessionUiState())
    val uiState: StateFlow<CreateSessionUiState> = _uiState.asStateFlow()

    private var agentsJob: Job? = null
    private var agentsOrigin: String? = null
    private var workspaceJob: Job? = null
    private var savedHarolds: List<StoredCredential> = emptyList()
    private var pairedOrigin: String? = null
    private var pendingCreatedWorkspace: CreatedWorkspaceResult? = null

    init {
        viewModelScope.launch {
            loadHaroldMetadata()
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
            ?.serverOrigin
            .orEmpty()
        navigator.openAddWorkspace(preferredServerOrigin = selectedOrigin)
    }

    fun onWorkspaceChanged(workspaceId: String) {
        val workspace = _uiState.value.workspaces.firstOrNull { row -> row.id == workspaceId }
        _uiState.update { current ->
            current.copy(
                selectedWorkspaceId = workspaceId,
                error = null,
                agents = if (workspace?.serverOrigin.isNullOrEmpty()) current.agents else emptyList(),
                selectedAgentId = if (workspace?.serverOrigin.isNullOrEmpty()) current.selectedAgentId else null,
            )
        }
        if (workspace == null || workspace.serverOrigin.isEmpty()) {
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

        val paired = sessionGateway.pairedState.value as? PairedState.Paired
        val origin = workspace.serverOrigin.ifEmpty { paired?.serverOrigin }
        if (origin == null) {
            _uiState.update { current -> current.copy(error = "Connect to Harold first") }
            return
        }

        _uiState.update { current -> current.copy(submitting = true, error = null) }

        // Config options only exist once the agent has a session, so create it
        // on confirm for the selectors to render before the first prompt.
        viewModelScope.launch {
            val result = sessionRepository.createSession(
                serverOrigin = origin,
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
                            serverOrigin = origin,
                            haroldName = workspace.haroldName,
                            haroldColorId = workspace.haroldColorId,
                            haroldIconId = workspace.haroldIconId,
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

    private suspend fun loadHaroldMetadata() {
        savedHarolds = savedHaroldRepository?.list().orEmpty()
        pairedOrigin = (sessionGateway.pairedState.value as? PairedState.Paired)?.serverOrigin
    }

    private fun observeWorkspaces() {
        workspaceJob?.cancel()
        workspaceJob = viewModelScope.launch {
            workspaceRepository.observe().collect(::applyCachedWorkspaces)
        }
    }

    private suspend fun refreshWorkspaces() {
        targetOrigins().forEach { serverOrigin ->
            workspaceRepository.refresh(serverOrigin)
        }
    }

    private fun applyCachedWorkspaces(cached: List<CachedWorkspace>) {
        val origins = targetOrigins()
        val savedByOrigin = savedHarolds.associateBy { harold -> harold.serverOrigin }
        val scoped = savedHarolds.isNotEmpty()
        val rows = cached
            .filter { workspace -> workspace.serverOrigin in origins }
            .mapNotNull { cachedWorkspace ->
                val workspace = cachedWorkspace.workspace
                if (workspace.state != WorkspaceState.Available) {
                    return@mapNotNull null
                }
                val harold = savedByOrigin[cachedWorkspace.serverOrigin]
                workspace.toWorkspaceRow().copy(
                    id = if (scoped) {
                        "${cachedWorkspace.serverOrigin}|${workspace.id}"
                    } else {
                        workspace.id
                    },
                    serverOrigin = cachedWorkspace.serverOrigin,
                    haroldName = harold?.name.orEmpty(),
                    haroldColorId = harold?.colorId.orEmpty(),
                    haroldIconId = harold?.iconId.orEmpty(),
                )
            }

        val current = _uiState.value
        val pendingId = pendingCreatedWorkspace?.let { created ->
            workspaceId(created.serverOrigin, created.workspaceId)
        }
        val selected = rows.firstOrNull { row -> row.id == current.selectedWorkspaceId }
            ?: rows.firstOrNull { row -> row.id == pendingId }
            ?: rows.firstOrNull()
        val agentsForSelection = selected != null && selected.serverOrigin == agentsOrigin

        _uiState.update { state ->
            state.copy(
                workspaces = rows,
                selectedWorkspaceId = selected?.id.orEmpty(),
                agents = if (agentsForSelection) state.agents else emptyList(),
                selectedAgentId = if (agentsForSelection) state.selectedAgentId else null,
            )
        }
        if (selected != null && selected.serverOrigin.isNotEmpty() && !agentsForSelection) {
            loadAgents(selected)
        }
        if (selected != null && selected.id == pendingId) {
            pendingCreatedWorkspace = null
        }
    }

    private fun selectCreatedWorkspace(result: CreatedWorkspaceResult) {
        pendingCreatedWorkspace = result
        val targetId = workspaceId(result.serverOrigin, result.workspaceId)
        val workspace = _uiState.value.workspaces.firstOrNull { row ->
            row.id == targetId ||
                (row.serverOrigin == result.serverOrigin && row.id == result.workspaceId)
        }
        if (workspace == null) {
            return
        }
        pendingCreatedWorkspace = null
        selectWorkspace(workspace)
    }

    private fun selectWorkspace(workspace: WorkspaceRow) {
        val sameOrigin = workspace.serverOrigin == agentsOrigin &&
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
        if (savedHarolds.isNotEmpty()) {
            savedHarolds.map { harold -> harold.serverOrigin }.distinct()
        } else {
            listOfNotNull(pairedOrigin)
        }

    private fun workspaceId(serverOrigin: String, workspaceId: String): String =
        if (savedHarolds.isNotEmpty()) {
            "$serverOrigin|$workspaceId"
        } else {
            workspaceId
        }

    private fun loadAgents(workspace: WorkspaceRow) {
        val origin = workspace.serverOrigin.ifEmpty { return }
        observeAgents(origin)
        viewModelScope.launch {
            sessionRepository.refreshAgents(origin).onFailure { error ->
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

    private fun observeAgents(serverOrigin: String) {
        if (agentsOrigin == serverOrigin && agentsJob != null) {
            return
        }
        agentsJob?.cancel()
        agentsOrigin = serverOrigin
        agentsJob = viewModelScope.launch {
            sessionRepository.observeAgents(serverOrigin).collect { agents ->
                if (agentsOrigin == serverOrigin) {
                    applyAgents(agents)
                }
            }
        }
    }

    private fun applyAgents(cachedAgents: List<CachedAgent>) {
        val agents = cachedAgents
            .filter { agent -> agent.enabled }
            .map { agent -> AgentOption(id = agent.agentId, displayName = agent.displayName) }
        _uiState.update { current ->
            current.copy(
                agents = agents,
                selectedAgentId = current.selectedAgentId
                    ?.takeIf { selected -> agents.any { agent -> agent.id == selected } }
                    ?: agents.firstOrNull()?.id,
                error = null,
            )
        }
    }

    private suspend fun agentNeedsLogin(serverOrigin: String, agentId: AgentId): Boolean =
        userRepository.getAgentAuth(serverOrigin = serverOrigin, agentId = agentId)
            .getOrNull()
            ?.status == AgentAuthStatus.NeedsAuth
}
