package harold.android.workspaces

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.contracts.Workspace
import harold.android.credentials.ConnectionRepository
import harold.android.credentials.SavedConnection
import harold.android.network.apiErrorMessage
import harold.android.session.ActiveConnectionState
import harold.android.session.ConnectionGateway
import harold.android.database.workspace.CachedWorkspace
import harold.android.database.workspace.WorkspaceRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class WorkspaceConnectionBadge(
    val connectionId: String,
    val name: String,
    val colorId: String,
    val iconId: String,
)

sealed interface WorkspacesLoadState {
    data object Loading : WorkspacesLoadState

    data class Loaded(
        val workspaces: List<Workspace>,
    ) : WorkspacesLoadState

    data object Empty : WorkspacesLoadState

    data class Error(
        val message: String,
    ) : WorkspacesLoadState
}

data class WorkspacesUiState(
    val loadState: WorkspacesLoadState = WorkspacesLoadState.Loading,
    val connectionByWorkspaceId: Map<String, WorkspaceConnectionBadge> = emptyMap(),
)

@HiltViewModel
class WorkspacesViewModel @Inject constructor(
    private val connectionGateway: ConnectionGateway,
    private val workspaceRepository: WorkspaceRepository,
    private val connectionRepository: ConnectionRepository? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(WorkspacesUiState())
    val uiState: StateFlow<WorkspacesUiState> = _uiState.asStateFlow()

    private var cached: List<CachedWorkspace> = emptyList()
    private var savedConnections: List<SavedConnection> = emptyList()
    private var targetOrigins: List<String> = emptyList()
    private var refreshing = false
    private var loadAttempted = false
    private var refreshError: Throwable? = null

    init {
        viewModelScope.launch {
            // Read credentials before the first Room emission so cached rows
            // already carry the right host badges and scoped IDs.
            loadConnectionMetadata()
            workspaceRepository.observe().collect { workspaces ->
                cached = workspaces
                publish()
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            loadWorkspaces()
        }
    }

    private suspend fun loadWorkspaces() {
        loadConnectionMetadata()

        refreshing = true
        loadAttempted = true
        refreshError = null
        publish()

        var anySuccess = false
        var lastError: Throwable? = null
        targetOrigins.forEach { connectionId ->
            workspaceRepository.refresh(connectionId).fold(
                onSuccess = { anySuccess = true },
                onFailure = { error -> lastError = error },
            )
        }

        refreshing = false
        refreshError = if (anySuccess) null else lastError
        publish()
    }

    private suspend fun loadConnectionMetadata() {
        savedConnections = connectionRepository?.list().orEmpty()
        val active = connectionGateway.activeConnection.value as? ActiveConnectionState.Active
        targetOrigins = if (savedConnections.isNotEmpty()) {
            savedConnections.map { connection -> connection.connectionId }
        } else {
            listOfNotNull(active?.connectionId)
        }
    }

    private fun publish() {
        val savedByOrigin = savedConnections.associateBy { connection -> connection.connectionId }
        val source = if (loadAttempted) {
            targetOrigins.flatMap { connectionId ->
                cached.filter { workspace -> workspace.connectionId == connectionId }
            }
        } else {
            cached
        }
        val scoped = targetOrigins.size > 1

        val workspaces = mutableListOf<Workspace>()
        val badges = mutableMapOf<String, WorkspaceConnectionBadge>()
        source.forEach { cachedWorkspace ->
            val id = if (scoped) {
                "${cachedWorkspace.connectionId}|${cachedWorkspace.workspace.id}"
            } else {
                cachedWorkspace.workspace.id
            }
            workspaces += cachedWorkspace.workspace.copy(id = id)
            savedByOrigin[cachedWorkspace.connectionId]?.let { connection ->
                badges[id] = WorkspaceConnectionBadge(
                    connectionId = connection.connectionId,
                    name = connection.name,
                    colorId = connection.colorId,
                    iconId = connection.iconId,
                )
            }
        }

        val loadState = when {
            workspaces.isNotEmpty() -> WorkspacesLoadState.Loaded(workspaces)
            refreshing || !loadAttempted -> WorkspacesLoadState.Loading
            refreshError != null -> WorkspacesLoadState.Error(apiErrorMessage(checkNotNull(refreshError)))
            else -> WorkspacesLoadState.Empty
        }

        _uiState.value = WorkspacesUiState(
            loadState = loadState,
            connectionByWorkspaceId = badges,
        )
    }
}
