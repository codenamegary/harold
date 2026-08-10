package server.agent.android.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import server.agent.android.contracts.CreateWorkspaceBody
import server.agent.android.contracts.FilesystemDirectory
import server.agent.android.network.AgentApiError
import server.agent.android.network.AgentApiException
import server.agent.android.operator.OperatorRepository
import server.agent.android.session.PairedState
import server.agent.android.session.SessionGateway

sealed interface RootsLoadState {
    data object Loading : RootsLoadState

    data class Loaded(
        val roots: List<String>,
    ) : RootsLoadState

    data object Empty : RootsLoadState

    data class Error(
        val message: String,
    ) : RootsLoadState
}

sealed interface FoldersLoadState {
    data object Idle : FoldersLoadState

    data object Loading : FoldersLoadState

    data class Loaded(
        val folders: List<FilesystemDirectory>,
    ) : FoldersLoadState

    data object Empty : FoldersLoadState

    data class Error(
        val message: String,
    ) : FoldersLoadState
}

data class AddWorkspaceUiState(
    val name: String = "",
    val selectedRoot: String = "",
    val selectedFolderPath: String = "",
    val folderQuery: String = "",
    val rootsLoadState: RootsLoadState = RootsLoadState.Loading,
    val foldersLoadState: FoldersLoadState = FoldersLoadState.Idle,
    val submitting: Boolean = false,
    val submitError: String? = null,
    val created: Boolean = false,
) {
    val hasNoRoots: Boolean
        get() = rootsLoadState is RootsLoadState.Empty

    val filteredFolders: List<FilesystemDirectory>
        get() {
            val loaded = foldersLoadState as? FoldersLoadState.Loaded ?: return emptyList()
            val query = folderQuery.trim()
            if (query.isEmpty()) {
                return loaded.folders
            }
            return loaded.folders.filter { folder ->
                folder.name.contains(query, ignoreCase = true) ||
                    folder.path.contains(query, ignoreCase = true)
            }
        }

    val canSubmit: Boolean
        get() =
            name.trim().isNotEmpty() &&
                selectedFolderPath.isNotEmpty() &&
                !submitting &&
                !hasNoRoots &&
                rootsLoadState !is RootsLoadState.Error &&
                foldersLoadState !is FoldersLoadState.Error
}

class AddWorkspaceViewModel(
    private val sessionGateway: SessionGateway,
    private val operatorRepository: OperatorRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow(AddWorkspaceUiState())
    val uiState: StateFlow<AddWorkspaceUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            loadRoots()
        }
    }

    fun onNameChanged(name: String) {
        _uiState.update { it.copy(name = name, submitError = null) }
    }

    fun onRootChanged(root: String) {
        _uiState.update {
            it.copy(
                selectedRoot = root,
                selectedFolderPath = "",
                folderQuery = "",
                foldersLoadState = FoldersLoadState.Loading,
                submitError = null,
            )
        }
        viewModelScope.launch {
            loadFolders(root)
        }
    }

    fun onFolderChanged(folderPath: String) {
        _uiState.update {
            it.copy(
                selectedFolderPath = folderPath,
                name = folderBasename(folderPath),
                submitError = null,
            )
        }
    }

    fun onFolderQueryChanged(query: String) {
        _uiState.update { it.copy(folderQuery = query) }
    }

    fun submit() {
        val state = _uiState.value
        if (!state.canSubmit) {
            return
        }

        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        viewModelScope.launch {
            _uiState.update { it.copy(submitting = true, submitError = null) }

            operatorRepository.createWorkspace(
                serverOrigin = paired.serverOrigin,
                body = CreateWorkspaceBody(
                    name = state.name.trim(),
                    path = state.selectedFolderPath,
                ),
            ).fold(
                onSuccess = {
                    _uiState.update { it.copy(submitting = false, created = true) }
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            submitting = false,
                            submitError = errorMessage(error),
                        )
                    }
                },
            )
        }
    }

    private suspend fun loadRoots() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        _uiState.update { it.copy(rootsLoadState = RootsLoadState.Loading) }

        operatorRepository.getRuntimeSettings(paired.serverOrigin).fold(
            onSuccess = { view ->
                val roots = view.settings.allowedRoots
                _uiState.update {
                    it.copy(
                        rootsLoadState = if (roots.isEmpty()) {
                            RootsLoadState.Empty
                        } else {
                            RootsLoadState.Loaded(roots)
                        },
                    )
                }
            },
            onFailure = { error ->
                _uiState.update {
                    it.copy(rootsLoadState = RootsLoadState.Error(errorMessage(error)))
                }
            },
        )
    }

    private suspend fun loadFolders(root: String) {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired ?: return

        operatorRepository.listFilesystemDirectories(paired.serverOrigin, root).fold(
            onSuccess = { collection ->
                _uiState.update {
                    it.copy(
                        foldersLoadState = if (collection.items.isEmpty()) {
                            FoldersLoadState.Empty
                        } else {
                            FoldersLoadState.Loaded(collection.items)
                        },
                    )
                }
            },
            onFailure = { error ->
                _uiState.update {
                    it.copy(foldersLoadState = FoldersLoadState.Error(errorMessage(error)))
                }
            },
        )
    }

    private fun errorMessage(error: Throwable): String =
        when (val apiError = (error as? AgentApiException)?.error) {
            is AgentApiError.Unauthorized -> apiError.detail ?: "Authentication required"
            is AgentApiError.Problem -> apiError.detail ?: apiError.title
            is AgentApiError.Decode -> "Unexpected response from Agent Server"
            is AgentApiError.Transport -> "Could not reach Agent Server"
            null -> error.message ?: "Request failed"
        }
}

class AddWorkspaceViewModelFactory(
    private val sessionGateway: SessionGateway,
    private val operatorRepository: OperatorRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(AddWorkspaceViewModel::class.java)) {
            return AddWorkspaceViewModel(
                sessionGateway = sessionGateway,
                operatorRepository = operatorRepository,
            ) as T
        }

        throw IllegalArgumentException("Unknown ViewModel class: ${modelClass.name}")
    }
}
