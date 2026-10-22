package harold.android.workspaces

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectory
import harold.android.credentials.SavedHaroldRepository
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
    val harolds: List<WorkspaceHaroldBadge> = emptyList(),
    val selectedServerOrigin: String = "",
    val name: String = "",
    val selectedRoot: String = "",
    val selectedFolderPath: String = "",
    val folderQuery: String = "",
    val rootsLoadState: RootsLoadState = RootsLoadState.Loading,
    val foldersLoadState: FoldersLoadState = FoldersLoadState.Idle,
    val submitting: Boolean = false,
    val submitError: String? = null,
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

@HiltViewModel
class AddWorkspaceViewModel @Inject constructor(
    private val sessionGateway: SessionGateway,
    private val userRepository: UserRepository,
    private val navigator: Navigator,
    private val savedHaroldRepository: SavedHaroldRepository? = null,
) : ViewModel() {
    private val _uiState = MutableStateFlow(AddWorkspaceUiState())
    val uiState: StateFlow<AddWorkspaceUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            initialize()
        }
    }

    private suspend fun initialize() {
        val paired = sessionGateway.pairedState.value as? PairedState.Paired
        val saved = savedHaroldRepository?.list().orEmpty().map { harold ->
            WorkspaceHaroldBadge(
                serverOrigin = harold.serverOrigin,
                name = harold.name,
                colorId = harold.colorId,
                iconId = harold.iconId,
            )
        }
        val initialOrigin = paired?.serverOrigin?.takeIf { origin ->
            saved.isEmpty() || saved.any { it.serverOrigin == origin }
        } ?: saved.firstOrNull()?.serverOrigin.orEmpty()

        _uiState.update {
            it.copy(
                harolds = saved,
                selectedServerOrigin = initialOrigin,
            )
        }
        loadRoots(initialOrigin)
    }

    fun onHaroldChanged(serverOrigin: String) {
        if (serverOrigin == _uiState.value.selectedServerOrigin) {
            return
        }
        _uiState.update {
            it.copy(
                selectedServerOrigin = serverOrigin,
                selectedRoot = "",
                selectedFolderPath = "",
                folderQuery = "",
                name = "",
                rootsLoadState = RootsLoadState.Loading,
                foldersLoadState = FoldersLoadState.Idle,
                submitError = null,
            )
        }
        viewModelScope.launch {
            loadRoots(serverOrigin)
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

        val origin = state.selectedServerOrigin.ifEmpty {
            (sessionGateway.pairedState.value as? PairedState.Paired)?.serverOrigin.orEmpty()
        }
        if (origin.isEmpty()) {
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(submitting = true, submitError = null) }

            userRepository.createWorkspace(
                serverOrigin = origin,
                body = CreateWorkspaceBody(
                    name = state.name.trim(),
                    path = state.selectedFolderPath,
                ),
            ).fold(
                onSuccess = {
                    _uiState.update { it.copy(submitting = false) }
                    navigator.goBack()
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            submitting = false,
                            submitError = apiErrorMessage(error),
                        )
                    }
                },
            )
        }
    }

    private suspend fun loadRoots(originOverride: String? = null) {
        val origin = originOverride?.takeIf { it.isNotEmpty() }
            ?: _uiState.value.selectedServerOrigin.ifEmpty {
                (sessionGateway.pairedState.value as? PairedState.Paired)?.serverOrigin.orEmpty()
            }
        if (origin.isEmpty()) {
            return
        }

        _uiState.update { it.copy(rootsLoadState = RootsLoadState.Loading) }

        userRepository.getRuntimeSettings(origin).fold(
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
                    it.copy(rootsLoadState = RootsLoadState.Error(apiErrorMessage(error)))
                }
            },
        )
    }

    private suspend fun loadFolders(root: String) {
        val origin = _uiState.value.selectedServerOrigin.ifEmpty {
            (sessionGateway.pairedState.value as? PairedState.Paired)?.serverOrigin.orEmpty()
        }
        if (origin.isEmpty()) {
            return
        }

        userRepository.listFilesystemDirectories(origin, root).fold(
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
                    it.copy(foldersLoadState = FoldersLoadState.Error(apiErrorMessage(error)))
                }
            },
        )
    }
}
