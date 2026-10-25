package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.chat.data.CachedAgent
import harold.android.chat.data.SessionRepository
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.WorkspaceState
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.StoredCredential
import harold.android.navigation.CreatedWorkspaceResult
import harold.android.navigation.Navigator
import harold.android.network.apiErrorMessage
import harold.android.session.HaroldConnectionStatus
import harold.android.session.HaroldConnections
import harold.android.session.PairedState
import harold.android.session.SessionGateway
import harold.android.user.UserRepository
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class CreateSessionViewModel @Inject constructor(
    private val sessionGateway: SessionGateway,
    private val sessionRepository: SessionRepository,
    private val userRepository: UserRepository,
    private val sessionCommands: SessionCommands,
    private val navigator: Navigator,
    private val savedHaroldRepository: SavedHaroldRepository? = null,
    private val haroldConnections: HaroldConnections? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(CreateSessionUiState())
    val uiState: StateFlow<CreateSessionUiState> = _uiState.asStateFlow()

    private var agentsJob: Job? = null
    private var agentsOrigin: String? = null

    init {
        viewModelScope.launch {
            load()
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

    private suspend fun load() {
        val saved = savedHaroldRepository?.list().orEmpty()
        if (saved.isEmpty()) {
            val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
            _uiState.value = loadCreateForm(paired.serverOrigin)
            observeAgents(paired.serverOrigin)
            return
        }

        val workspaces = saved.filter { harold -> isReachable(harold.serverOrigin) }
            .flatMap { harold -> workspacesFor(harold) }
        val first = workspaces.firstOrNull()
        _uiState.value = CreateSessionUiState(
            workspaces = workspaces,
            selectedWorkspaceId = first?.id.orEmpty(),
        )
        if (first != null) {
            loadAgents(first)
        }
    }

    private suspend fun selectCreatedWorkspace(result: CreatedWorkspaceResult) {
        val saved = savedHaroldRepository?.list().orEmpty()
        if (saved.isEmpty()) {
            val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
            val workspaces = userRepository.listWorkspaces(paired.serverOrigin).getOrNull()?.items.orEmpty()
                .map { workspace -> workspace.toWorkspaceRow() }
                .filter { workspace -> workspace.state == WorkspaceState.Available }
            val targetId = workspaces.firstOrNull { workspace -> workspace.id == result.workspaceId }?.id
                ?: _uiState.value.selectedWorkspaceId
            _uiState.update { current ->
                current.copy(
                    workspaces = workspaces,
                    selectedWorkspaceId = targetId,
                    error = null,
                )
            }
            observeAgents(paired.serverOrigin)
            return
        }

        val workspaces = saved.filter { harold -> isReachable(harold.serverOrigin) }
            .flatMap { harold -> workspacesFor(harold) }
        val scopedId = "${result.serverOrigin}|${result.workspaceId}"
        val selected = workspaces.firstOrNull { workspace ->
            workspace.id == scopedId || workspace.id == result.workspaceId
        }
        if (selected == null) {
            _uiState.update { current -> current.copy(workspaces = workspaces) }
            return
        }
        val previousWorkspace = _uiState.value.workspaces.firstOrNull { row ->
            row.id == _uiState.value.selectedWorkspaceId
        }
        val sameOrigin = previousWorkspace != null &&
            previousWorkspace.serverOrigin == selected.serverOrigin &&
            _uiState.value.agents.isNotEmpty()
        _uiState.update { current ->
            current.copy(
                workspaces = workspaces,
                selectedWorkspaceId = selected.id,
                error = null,
                agents = if (sameOrigin) current.agents else emptyList(),
                selectedAgentId = if (sameOrigin) current.selectedAgentId else null,
            )
        }
        if (!sameOrigin) {
            loadAgents(selected)
        }
    }

    private fun isReachable(serverOrigin: String): Boolean {
        val link = haroldConnections?.connections?.value
            ?.find { connection -> connection.serverOrigin == serverOrigin }
            ?: return true
        return link.status != HaroldConnectionStatus.Unreachable &&
            link.status != HaroldConnectionStatus.Closed
    }

    private suspend fun workspacesFor(harold: StoredCredential): List<WorkspaceRow> {
        val listed = userRepository.listWorkspaces(harold.serverOrigin).getOrNull() ?: return emptyList()
        return listed.items
            .map { workspace -> workspace.toWorkspaceRow() }
            .filter { workspace -> workspace.state == WorkspaceState.Available }
            .map { workspace ->
                workspace.copy(
                    id = "${harold.serverOrigin}|${workspace.id}",
                    serverOrigin = harold.serverOrigin,
                    haroldName = harold.name,
                    haroldColorId = harold.colorId,
                    haroldIconId = harold.iconId,
                )
            }
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

    private suspend fun loadCreateForm(serverOrigin: String): CreateSessionUiState {
        val workspaces = userRepository.listWorkspaces(serverOrigin).getOrNull()?.items.orEmpty()
            .map { workspace -> workspace.toWorkspaceRow() }
            .filter { workspace -> workspace.state == WorkspaceState.Available }

        sessionRepository.refreshAgents(serverOrigin)
        val agents = sessionRepository.observeAgents(serverOrigin).first()
            .filter { agent -> agent.enabled }
            .map { agent -> AgentOption(id = agent.agentId, displayName = agent.displayName) }

        return CreateSessionUiState(
            workspaces = workspaces,
            agents = agents,
            selectedWorkspaceId = workspaces.firstOrNull()?.id.orEmpty(),
            selectedAgentId = agents.firstOrNull()?.id,
        )
    }

    private suspend fun agentNeedsLogin(serverOrigin: String, agentId: AgentId): Boolean =
        userRepository.getAgentAuth(serverOrigin = serverOrigin, agentId = agentId)
            .getOrNull()
            ?.status == AgentAuthStatus.NeedsAuth
}
