package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import harold.android.user.UserRepository
import harold.android.session.PairedState
import harold.android.session.SessionGateway

sealed interface WorkspacesLoadState {
    data object Loading : WorkspacesLoadState

    data class Loaded(
        val workspaces: List<WorkspaceRow>,
    ) : WorkspacesLoadState

    data object Empty : WorkspacesLoadState

    data class Error(
        val message: String,
    ) : WorkspacesLoadState
}

data class WorkspacesUiState(
    val loadState: WorkspacesLoadState = WorkspacesLoadState.Loading,
)

@HiltViewModel
class WorkspacesViewModel @Inject constructor(
    private val sessionGateway: SessionGateway,
    private val userRepository: UserRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(WorkspacesUiState())
    val uiState: StateFlow<WorkspacesUiState> = _uiState.asStateFlow()

    fun refresh() {
        viewModelScope.launch {
            loadWorkspaces()
        }
    }

    private suspend fun loadWorkspaces() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        _uiState.update { WorkspacesUiState(loadState = WorkspacesLoadState.Loading) }

        userRepository.listWorkspaces(paired.serverOrigin).fold(
            onSuccess = { collection ->
                val rows = collection.items.map { workspace -> workspace.toWorkspaceRow() }

                _uiState.update {
                    WorkspacesUiState(
                        loadState = if (rows.isEmpty()) {
                            WorkspacesLoadState.Empty
                        } else {
                            WorkspacesLoadState.Loaded(rows)
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
