package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SavedConnection
import harold.android.database.workspace.CachedWorkspace
import harold.android.database.workspace.WorkspaceRepository
import harold.android.navigation.ChosenCreateSessionWorkspace
import harold.android.navigation.Navigator
import harold.android.network.apiErrorMessage
import harold.android.session.ActiveConnectionState
import harold.android.session.ConnectionGateway
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class WorkspaceChooserUiState(
    val workspaces: List<WorkspaceRow> = emptyList(),
    val visibleWorkspaces: List<WorkspaceRow> = emptyList(),
    val search: String = "",
    val hasLoaded: Boolean = false,
    val loading: Boolean = true,
    val error: String? = null,
)

/** The full saved-workspace list for the new-session form. */
@HiltViewModel
class WorkspaceChooserViewModel @Inject constructor(
    private val connectionGateway: ConnectionGateway,
    private val workspaceRepository: WorkspaceRepository,
    private val navigator: Navigator,
    private val connectionRepository: ConnectionRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(WorkspaceChooserUiState())
    val uiState: StateFlow<WorkspaceChooserUiState> = _uiState.asStateFlow()

    private var savedConnections: List<SavedConnection> = emptyList()
    private var cached: List<CachedWorkspace> = emptyList()
    private var targetOrigins: List<String> = emptyList()

    init {
        viewModelScope.launch {
            loadConnectionMetadata()
            viewModelScope.launch {
                workspaceRepository.observe().collect { workspaces ->
                    cached = workspaces
                    _uiState.update { current -> current.copy(hasLoaded = true) }
                    publish()
                }
            }
            refreshWorkspaces()
        }
    }

    fun onSearchChanged(query: String) {
        _uiState.update { current -> current.copy(search = query) }
        publish()
    }

    fun select(row: WorkspaceRow) {
        navigator.reportChosenCreateSessionWorkspace(
            ChosenCreateSessionWorkspace(
                connectionId = row.connectionId,
                workspaceId = row.workspaceId,
            ),
        )
        navigator.goBack()
    }

    private suspend fun loadConnectionMetadata() {
        savedConnections = connectionRepository.list()
        val active = connectionGateway.activeConnection.value as? ActiveConnectionState.Active
        targetOrigins = if (savedConnections.isNotEmpty()) {
            savedConnections.map { connection -> connection.connectionId }.distinct()
        } else {
            listOfNotNull(active?.connectionId)
        }
        publish()
    }

    private suspend fun refreshWorkspaces() {
        _uiState.update { current -> current.copy(loading = true, error = null) }
        var anySuccess = false
        var lastError: Throwable? = null
        targetOrigins.forEach { connectionId ->
            workspaceRepository.refresh(connectionId).fold(
                onSuccess = { anySuccess = true },
                onFailure = { error -> lastError = error },
            )
        }
        _uiState.update { current ->
            current.copy(
                loading = false,
                error = if (!anySuccess) lastError?.let(::apiErrorMessage) else null,
            )
        }
        publish()
    }

    private fun publish() {
        val rows = workspaceRows(
            cached = cached,
            origins = targetOrigins,
            savedConnections = savedConnections,
        )
        val search = _uiState.value.search.trim()
        val visible = if (search.isEmpty()) {
            rows
        } else {
            rows.filter { row ->
                row.name.contains(search, ignoreCase = true) ||
                    row.path.contains(search, ignoreCase = true)
            }
        }
        _uiState.update { current ->
            current.copy(
                workspaces = rows,
                visibleWorkspaces = visible,
            )
        }
    }
}
