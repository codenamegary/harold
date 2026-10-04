package harold.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import harold.android.network.AgentApiError
import harold.android.network.AgentApiException
import harold.android.operator.OperatorRepository
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

class WorkspacesViewModel(
    private val sessionGateway: SessionGateway,
    private val operatorRepository: OperatorRepository,
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

        operatorRepository.listWorkspaces(paired.serverOrigin).fold(
            onSuccess = { collection ->
                val rows = collection.items.map { workspace ->
                    WorkspaceRow(
                        id = workspace.id,
                        name = workspace.name,
                        path = workspace.path,
                        state = workspace.state,
                    )
                }

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
                        loadState = WorkspacesLoadState.Error(errorMessage(error)),
                    )
                }
            },
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

class WorkspacesViewModelFactory(
    private val sessionGateway: SessionGateway,
    private val operatorRepository: OperatorRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(WorkspacesViewModel::class.java)) {
            return WorkspacesViewModel(
                sessionGateway = sessionGateway,
                operatorRepository = operatorRepository,
            ) as T
        }

        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
