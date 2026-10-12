package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.contracts.AgentSettings
import harold.android.contracts.Session
import harold.android.contracts.SessionState
import harold.android.contracts.Workspace
import harold.android.navigation.Navigator
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.session.PairedState
import harold.android.session.SessionGateway
import harold.android.user.UserRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class SessionsUiState(
    val sessions: List<SessionRow> = emptyList(),
    val search: String = "",
    val loading: Boolean = true,
    val error: String? = null,
)

@HiltViewModel
class SessionsViewModel @Inject constructor(
    private val sessionGateway: SessionGateway,
    private val userRepository: UserRepository,
    private val sessionCommands: SessionCommands,
    private val navigator: Navigator,
) : ViewModel() {
    private val _uiState = MutableStateFlow(SessionsUiState())
    val uiState: StateFlow<SessionsUiState> = _uiState.asStateFlow()

    private var catalog: List<SessionRow> = emptyList()

    init {
        viewModelScope.launch {
            load()
        }
    }

    fun onSearchChanged(query: String) {
        _uiState.update { current -> current.copy(search = query) }
        publish()
    }

    fun select(row: SessionRow) {
        sessionCommands.emit(SessionCommand.Open(row))
        navigator.goBack()
    }

    fun delete(row: SessionRow) {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        viewModelScope.launch {
            userRepository.deleteSession(
                serverOrigin = paired.serverOrigin,
                agentId = row.agentId,
                sessionId = row.sessionId,
            ).fold(
                onSuccess = {
                    catalog = catalog.filterNot { item -> item.id == row.id }
                    publish()
                    sessionCommands.emit(SessionCommand.Deleted(row))
                },
                onFailure = { error ->
                    _uiState.update { current -> current.copy(error = errorMessage(error)) }
                },
            )
        }
    }

    private suspend fun load() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired
        if (paired == null) {
            _uiState.update { current -> current.copy(loading = false) }
            return
        }

        val workspaces = userRepository.listWorkspaces(paired.serverOrigin)
            .getOrNull()
            ?.items
            .orEmpty()
        val agents = userRepository.listAgents(paired.serverOrigin)
            .getOrNull()
            ?.items
            .orEmpty()

        userRepository.listSessions(paired.serverOrigin).fold(
            onSuccess = { collection ->
                catalog = collection.items.map { session ->
                    session.toRow(workspaces, agents)
                }
                publish()
                _uiState.update { current -> current.copy(loading = false, error = null) }
            },
            onFailure = { error ->
                _uiState.update { current ->
                    current.copy(loading = false, error = errorMessage(error))
                }
            },
        )
    }

    private fun publish() {
        val search = _uiState.value.search.trim()
        val sessions = catalog
            .filter { row -> search.isEmpty() || row.name.contains(search, ignoreCase = true) }
            .sortedByDescending { row -> row.updatedAt }
        _uiState.update { current -> current.copy(sessions = sessions) }
    }

    private fun Session.toRow(
        workspaces: List<Workspace>,
        agents: List<AgentSettings>,
    ): SessionRow {
        val workspace = workspaces.firstOrNull { item -> item.path == cwd }
        return SessionRow(
            sessionId = sessionId,
            name = title.ifBlank { sessionId },
            cwd = cwd,
            workspaceId = workspace?.id.orEmpty(),
            workspaceLabel = workspace?.name ?: cwd,
            agentId = agentId,
            agentLabel = agents.firstOrNull { agent -> agent.id == agentId }?.displayName ?: agentId,
            state = SessionState.Idle,
            updatedAt = updatedAt,
        )
    }

    private fun errorMessage(error: Throwable): String =
        when (val apiError = (error as? AgentApiException)?.error) {
            is AgentApiError.Unauthorized -> apiError.detail ?: "Authentication required"
            is AgentApiError.Problem -> apiError.detail ?: apiError.title
            is AgentApiError.Decode -> "Unexpected response from Harold"
            is AgentApiError.Transport -> "Could not reach Harold"
            null -> error.message ?: "Request failed"
        }
}
