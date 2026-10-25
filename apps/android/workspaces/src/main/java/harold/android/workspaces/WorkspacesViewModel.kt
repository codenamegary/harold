package harold.android.workspaces

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.contracts.Workspace
import harold.android.credentials.SavedHaroldRepository
import harold.android.credentials.StoredCredential
import harold.android.network.apiErrorMessage
import harold.android.session.PairedState
import harold.android.session.SessionGateway
import harold.android.workspaces.data.CachedWorkspace
import harold.android.workspaces.data.WorkspaceRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class WorkspaceHaroldBadge(
    val serverOrigin: String,
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
    val haroldByWorkspaceId: Map<String, WorkspaceHaroldBadge> = emptyMap(),
)

@HiltViewModel
class WorkspacesViewModel @Inject constructor(
    private val sessionGateway: SessionGateway,
    private val workspaceRepository: WorkspaceRepository,
    private val savedHaroldRepository: SavedHaroldRepository? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(WorkspacesUiState())
    val uiState: StateFlow<WorkspacesUiState> = _uiState.asStateFlow()

    private var cached: List<CachedWorkspace> = emptyList()
    private var savedHarolds: List<StoredCredential> = emptyList()
    private var targetOrigins: List<String> = emptyList()
    private var refreshing = false
    private var loadAttempted = false
    private var refreshError: Throwable? = null

    init {
        viewModelScope.launch {
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
        savedHarolds = savedHaroldRepository?.list().orEmpty()
        val paired = sessionGateway.pairedState.value as? PairedState.Paired
        targetOrigins = if (savedHarolds.isNotEmpty()) {
            savedHarolds.map { harold -> harold.serverOrigin }
        } else {
            listOfNotNull(paired?.serverOrigin)
        }

        refreshing = true
        loadAttempted = true
        refreshError = null
        publish()

        var anySuccess = false
        var lastError: Throwable? = null
        targetOrigins.forEach { serverOrigin ->
            workspaceRepository.refresh(serverOrigin).fold(
                onSuccess = { anySuccess = true },
                onFailure = { error -> lastError = error },
            )
        }

        refreshing = false
        refreshError = if (anySuccess) null else lastError
        publish()
    }

    private fun publish() {
        val savedByOrigin = savedHarolds.associateBy { harold -> harold.serverOrigin }
        val source = if (loadAttempted) {
            targetOrigins.flatMap { serverOrigin ->
                cached.filter { workspace -> workspace.serverOrigin == serverOrigin }
            }
        } else {
            cached
        }
        val scoped = targetOrigins.size > 1

        val workspaces = mutableListOf<Workspace>()
        val badges = mutableMapOf<String, WorkspaceHaroldBadge>()
        source.forEach { cachedWorkspace ->
            val id = if (scoped) {
                "${cachedWorkspace.serverOrigin}|${cachedWorkspace.workspace.id}"
            } else {
                cachedWorkspace.workspace.id
            }
            workspaces += cachedWorkspace.workspace.copy(id = id)
            savedByOrigin[cachedWorkspace.serverOrigin]?.let { harold ->
                badges[id] = WorkspaceHaroldBadge(
                    serverOrigin = harold.serverOrigin,
                    name = harold.name,
                    colorId = harold.colorId,
                    iconId = harold.iconId,
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
            haroldByWorkspaceId = badges,
        )
    }
}
