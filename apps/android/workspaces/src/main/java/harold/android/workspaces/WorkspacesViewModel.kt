package harold.android.workspaces

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.contracts.Workspace
import harold.android.credentials.SavedHaroldRepository
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
    private val userRepository: UserRepository,
    private val savedHaroldRepository: SavedHaroldRepository? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(WorkspacesUiState())
    val uiState: StateFlow<WorkspacesUiState> = _uiState.asStateFlow()

    fun refresh() {
        viewModelScope.launch {
            loadWorkspaces()
        }
    }

    private suspend fun loadWorkspaces() {
        val saved = savedHaroldRepository?.list().orEmpty()
        if (saved.isNotEmpty()) {
            _uiState.update { WorkspacesUiState(loadState = WorkspacesLoadState.Loading) }
            val allWorkspaces = mutableListOf<Workspace>()
            val badges = mutableMapOf<String, WorkspaceHaroldBadge>()
            var lastError: Throwable? = null
            var anySuccess = false

            saved.forEach { harold ->
                userRepository.listWorkspaces(harold.serverOrigin).fold(
                    onSuccess = { collection ->
                        anySuccess = true
                        collection.items.forEach { ws ->
                            val scopedId = if (saved.size > 1) "${harold.serverOrigin}|${ws.id}" else ws.id
                            allWorkspaces += ws.copy(id = scopedId)
                            badges[scopedId] = WorkspaceHaroldBadge(
                                serverOrigin = harold.serverOrigin,
                                name = harold.name,
                                colorId = harold.colorId,
                                iconId = harold.iconId,
                            )
                        }
                    },
                    onFailure = { error ->
                        lastError = error
                    },
                )
            }

            _uiState.update {
                when {
                    !anySuccess && lastError != null -> WorkspacesUiState(
                        loadState = WorkspacesLoadState.Error(apiErrorMessage(lastError)),
                    )
                    allWorkspaces.isEmpty() -> WorkspacesUiState(
                        loadState = WorkspacesLoadState.Empty,
                    )
                    else -> WorkspacesUiState(
                        loadState = WorkspacesLoadState.Loaded(allWorkspaces),
                        haroldByWorkspaceId = badges,
                    )
                }
            }
            return
        }

        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        _uiState.update { WorkspacesUiState(loadState = WorkspacesLoadState.Loading) }

        userRepository.listWorkspaces(paired.serverOrigin).fold(
            onSuccess = { collection ->
                val workspaces = collection.items

                _uiState.update {
                    WorkspacesUiState(
                        loadState = if (workspaces.isEmpty()) {
                            WorkspacesLoadState.Empty
                        } else {
                            WorkspacesLoadState.Loaded(workspaces)
                        },
                    )
                }
            },
            onFailure = { error ->
                _uiState.update {
                    WorkspacesUiState(
                        loadState = WorkspacesLoadState.Error(apiErrorMessage(error)),
                    )
                }
            },
        )
    }
}
