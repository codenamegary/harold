package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.navigation.Navigator
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
                    _uiState.update { current -> current.copy(error = apiErrorMessage(error)) }
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

        val workspaceByPath = userRepository.listWorkspaces(paired.serverOrigin)
            .getOrNull()
            ?.items
            .orEmpty()
            .map { workspace -> workspace.toWorkspaceRow() }
            .associateBy { workspace -> workspace.path }
        val agentLabels = userRepository.listAgents(paired.serverOrigin)
            .getOrNull()
            ?.items
            .orEmpty()
            .associate { agent -> agent.id to agent.displayName }

        userRepository.listSessions(paired.serverOrigin).fold(
            onSuccess = { collection ->
                catalog = collection.items.map { session ->
                    session.toSessionRow(workspaceByPath, agentLabels)
                }
                publish()
                _uiState.update { current -> current.copy(loading = false, error = null) }
            },
            onFailure = { error ->
                _uiState.update { current ->
                    current.copy(loading = false, error = apiErrorMessage(error))
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
}
