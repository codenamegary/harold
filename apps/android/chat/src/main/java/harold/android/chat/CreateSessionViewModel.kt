package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.contracts.AgentAuthStatus
import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.WorkspaceState
import harold.android.navigation.Navigator
import harold.android.network.apiErrorMessage
import harold.android.session.PairedState
import harold.android.session.SessionGateway
import harold.android.user.UserRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class CreateSessionViewModel @Inject constructor(
    private val sessionGateway: SessionGateway,
    private val userRepository: UserRepository,
    private val sessionCommands: SessionCommands,
    private val navigator: Navigator,
) : ViewModel() {
    private val _uiState = MutableStateFlow(CreateSessionUiState())
    val uiState: StateFlow<CreateSessionUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            load()
        }
    }

    fun onWorkspaceChanged(workspaceId: String) {
        _uiState.update { current ->
            current.copy(selectedWorkspaceId = workspaceId, error = null)
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
            _uiState.update { current -> current.copy(error = "Choose an agent") }
            return
        }

        val paired = sessionGateway.pairedState.value as? PairedState.Paired
        if (paired == null) {
            _uiState.update { current -> current.copy(error = "Connect to Harold first") }
            return
        }

        _uiState.update { current -> current.copy(submitting = true, error = null) }

        // Config options only exist once the agent has a session, so create it
        // on confirm for the selectors to render before the first prompt.
        viewModelScope.launch {
            val result = userRepository.createSession(
                serverOrigin = paired.serverOrigin,
                body = CreateSessionBody(
                    agentId = agentId,
                    cwd = workspace.path,
                ),
            )

            result.fold(
                onSuccess = { created ->
                    sessionCommands.emit(SessionCommand.Created(created))
                    navigator.goBack()
                },
                onFailure = { error ->
                    if (agentNeedsLogin(paired.serverOrigin, agentId)) {
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
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return
        _uiState.value = loadCreateForm(paired.serverOrigin)
    }

    private suspend fun loadCreateForm(serverOrigin: String): CreateSessionUiState {
        val workspaces = userRepository.listWorkspaces(serverOrigin).getOrNull()?.items.orEmpty()
            .map { workspace -> workspace.toWorkspaceRow() }
            .filter { workspace -> workspace.state == WorkspaceState.Available }

        val agents = userRepository.listAgents(serverOrigin).getOrNull()?.items.orEmpty()
            .filter { agent -> agent.enabled }
            .map { agent -> AgentOption(id = agent.id, displayName = agent.displayName) }

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
