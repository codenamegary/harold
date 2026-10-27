package harold.android.workspaces

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.contracts.CreateFilesystemDirectoryBody
import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.FilesystemDirectory
import harold.android.contracts.WorkspaceSource
import harold.android.credentials.SavedHaroldRepository
import harold.android.navigation.CreatedWorkspaceResult
import harold.android.navigation.Navigator
import harold.android.network.apiErrorMessage
import harold.android.session.PairedState
import harold.android.session.SessionGateway
import harold.android.user.UserRepository
import harold.android.database.workspace.WorkspaceRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AddWorkspaceMode {
    OpenFolder,
    CloneRepo,
}

sealed interface BrowserLoadState {
    data object Loading : BrowserLoadState

    data class Loaded(
        val path: String,
        val parent: String?,
        val folders: List<FilesystemDirectory>,
    ) : BrowserLoadState

    data class Error(
        val message: String,
    ) : BrowserLoadState
}

data class AddWorkspaceUiState(
    val harolds: List<WorkspaceHaroldBadge> = emptyList(),
    val selectedServerOrigin: String = "",
    val mode: AddWorkspaceMode = AddWorkspaceMode.OpenFolder,
    val browserLoadState: BrowserLoadState = BrowserLoadState.Loading,
    val folderQuery: String = "",
    val selectedFolderPath: String = "",
    val cloneParent: String = "",
    val cloneUrl: String = "",
    val cloneFolderName: String = "",
    val name: String = "",
    val submitting: Boolean = false,
    val submitError: String? = null,
) {
    val isClone: Boolean
        get() = mode == AddWorkspaceMode.CloneRepo

    val browserPath: String
        get() = (browserLoadState as? BrowserLoadState.Loaded)?.path.orEmpty()

    val browserParent: String?
        get() = (browserLoadState as? BrowserLoadState.Loaded)?.parent

    val folders: List<FilesystemDirectory>
        get() = (browserLoadState as? BrowserLoadState.Loaded)?.folders.orEmpty()

    val filteredFolders: List<FilesystemDirectory>
        get() {
            val query = folderQuery.trim()
            if (query.isEmpty()) {
                return folders
            }
            return folders.filter { folder ->
                folder.name.contains(query, ignoreCase = true) ||
                    folder.path.contains(query, ignoreCase = true)
            }
        }

    val finalPath: String
        get() = if (isClone) joinFolderPath(cloneParent, cloneFolderName) else selectedFolderPath

    val canSubmit: Boolean
        get() {
            if (submitting) return false
            if (browserLoadState is BrowserLoadState.Error) return false
            if (name.trim().isEmpty()) return false

            return if (isClone) {
                cloneUrl.trim().isNotEmpty() &&
                    cloneParent.isNotEmpty() &&
                    cloneFolderName.trim().isNotEmpty()
            } else {
                selectedFolderPath.isNotEmpty()
            }
        }
}

@HiltViewModel
class AddWorkspaceViewModel @Inject constructor(
    private val sessionGateway: SessionGateway,
    private val userRepository: UserRepository,
    private val workspaceRepository: WorkspaceRepository,
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
        val preferredOrigin = navigator.consumePreferredAddWorkspaceOrigin()
        val initialOrigin = preferredOrigin?.takeIf { origin ->
            saved.isEmpty() || saved.any { it.serverOrigin == origin }
        } ?: paired?.serverOrigin?.takeIf { origin ->
            saved.isEmpty() || saved.any { it.serverOrigin == origin }
        } ?: saved.firstOrNull()?.serverOrigin.orEmpty()

        _uiState.update {
            it.copy(
                harolds = saved,
                selectedServerOrigin = initialOrigin,
            )
        }
        loadBrowser(initialOrigin, root = null)
    }

    fun onHaroldChanged(serverOrigin: String) {
        if (serverOrigin == _uiState.value.selectedServerOrigin) {
            return
        }
        _uiState.update {
            it.copy(
                selectedServerOrigin = serverOrigin,
                browserLoadState = BrowserLoadState.Loading,
                folderQuery = "",
                selectedFolderPath = "",
                cloneParent = "",
                cloneUrl = "",
                cloneFolderName = "",
                name = "",
                submitError = null,
            )
        }
        viewModelScope.launch {
            loadBrowser(serverOrigin, root = null)
        }
    }

    fun onModeChanged(mode: AddWorkspaceMode) {
        if (mode == _uiState.value.mode) {
            return
        }
        _uiState.update {
            it.copy(
                mode = mode,
                selectedFolderPath = "",
                cloneParent = "",
                cloneUrl = "",
                cloneFolderName = "",
                name = "",
                submitError = null,
            )
        }
    }

    fun onNameChanged(name: String) {
        _uiState.update { it.copy(name = name, submitError = null) }
    }

    fun onFolderQueryChanged(query: String) {
        _uiState.update { it.copy(folderQuery = query) }
    }

    /** Drills into a folder shown in the browser. */
    fun onFolderSelected(folderPath: String) {
        _uiState.update {
            it.copy(
                folderQuery = "",
                browserLoadState = BrowserLoadState.Loading,
                submitError = null,
            )
        }
        viewModelScope.launch {
            loadBrowser(currentOrigin(), folderPath)
        }
    }

    fun onBrowserUp() {
        val parent = _uiState.value.browserParent ?: return
        _uiState.update {
            it.copy(
                folderQuery = "",
                browserLoadState = BrowserLoadState.Loading,
                submitError = null,
            )
        }
        viewModelScope.launch {
            loadBrowser(currentOrigin(), parent)
        }
    }

    /** Selects the folder the browser is currently showing. */
    fun onUseCurrentFolder() {
        val state = _uiState.value
        val path = state.browserPath
        if (path.isEmpty()) {
            return
        }

        _uiState.update {
            if (it.isClone) {
                it.copy(cloneParent = path, submitError = null)
            } else {
                it.copy(
                    selectedFolderPath = path,
                    name = workspaceNameForPath(path),
                    submitError = null,
                )
            }
        }
    }

    fun onCloneUrlChanged(url: String) {
        val folderName = folderNameFromUrl(url)
        _uiState.update {
            it.copy(
                cloneUrl = url,
                cloneFolderName = folderName,
                name = folderName,
                submitError = null,
            )
        }
    }

    fun onCloneFolderNameChanged(folderName: String) {
        _uiState.update {
            it.copy(
                cloneFolderName = folderName,
                name = folderName,
                submitError = null,
            )
        }
    }

    /** Creates one folder under the browser's current path, then selects it. */
    fun createFolder(folderName: String) {
        val state = _uiState.value
        val parent = state.browserPath
        val origin = currentOrigin()
        if (parent.isEmpty() || origin.isEmpty()) {
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(submitting = true, submitError = null) }

            userRepository.createFilesystemDirectory(
                serverOrigin = origin,
                body = CreateFilesystemDirectoryBody(parent = parent, name = folderName),
            ).fold(
                onSuccess = { created ->
                    _uiState.update { current ->
                        current.copy(
                            submitting = false,
                            browserLoadState = BrowserLoadState.Loading,
                            selectedFolderPath = if (current.isClone) {
                                current.selectedFolderPath
                            } else {
                                created.path
                            },
                            cloneParent = if (current.isClone) created.path else current.cloneParent,
                            name = if (current.isClone) current.name else created.name,
                        )
                    }
                    loadBrowser(origin, created.path)
                },
                onFailure = { error ->
                    _uiState.update { it.copy(submitting = false, submitError = apiErrorMessage(error)) }
                },
            )
        }
    }

    fun submit() {
        val state = _uiState.value
        if (!state.canSubmit) {
            return
        }

        val origin = currentOrigin()
        if (origin.isEmpty()) {
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(submitting = true, submitError = null) }

            if (state.isClone) {
                submitClone(origin, state)
            } else {
                submitFolder(origin, state)
            }
        }
    }

    private suspend fun submitFolder(origin: String, state: AddWorkspaceUiState) {
        workspaceRepository.create(
            serverOrigin = origin,
            body = CreateWorkspaceBody(
                source = WorkspaceSource.Folder,
                path = state.selectedFolderPath,
                name = state.name.trim(),
            ),
        ).fold(
            onSuccess = { created -> finish(origin, created.id) },
            onFailure = { error ->
                _uiState.update { it.copy(submitting = false, submitError = apiErrorMessage(error)) }
            },
        )
    }

    private suspend fun submitClone(origin: String, state: AddWorkspaceUiState) {
        val destinationName = state.cloneFolderName.trim()
        val createdFolder = userRepository.createFilesystemDirectory(
            serverOrigin = origin,
            body = CreateFilesystemDirectoryBody(parent = state.cloneParent, name = destinationName),
        )

        if (createdFolder.isFailure) {
            _uiState.update {
                it.copy(
                    submitting = false,
                    submitError = apiErrorMessage(checkNotNull(createdFolder.exceptionOrNull())),
                )
            }
            return
        }

        val destination = createdFolder.getOrThrow().path

        workspaceRepository.create(
            serverOrigin = origin,
            body = CreateWorkspaceBody(
                source = WorkspaceSource.Git,
                path = destination,
                name = state.name.trim(),
                url = state.cloneUrl.trim(),
            ),
        ).fold(
            onSuccess = { created -> finish(origin, created.id) },
            onFailure = { error ->
                _uiState.update {
                    it.copy(
                        submitting = false,
                        submitError = "${apiErrorMessage(error)}\n" +
                            "The folder $destination was created, but the workspace was not " +
                            "registered. Partial files may remain.",
                    )
                }
            },
        )
    }

    private fun finish(origin: String, workspaceId: String) {
        _uiState.update { it.copy(submitting = false) }
        navigator.reportWorkspaceCreated(
            CreatedWorkspaceResult(
                workspaceId = workspaceId,
                serverOrigin = origin,
            ),
        )
        navigator.goBack()
    }

    private suspend fun loadBrowser(origin: String, root: String?) {
        if (origin.isEmpty()) {
            return
        }

        userRepository.listFilesystemDirectories(origin, root).fold(
            onSuccess = { collection ->
                _uiState.update {
                    it.copy(
                        browserLoadState = BrowserLoadState.Loaded(
                            path = collection.path,
                            parent = collection.parent,
                            folders = collection.items,
                        ),
                    )
                }
            },
            onFailure = { error ->
                _uiState.update {
                    it.copy(browserLoadState = BrowserLoadState.Error(apiErrorMessage(error)))
                }
            },
        )
    }

    private fun currentOrigin(): String =
        _uiState.value.selectedServerOrigin.ifEmpty {
            (sessionGateway.pairedState.value as? PairedState.Paired)?.serverOrigin.orEmpty()
        }
}

internal fun joinFolderPath(parent: String, name: String): String {
    if (parent.isEmpty()) {
        return name
    }
    return if (parent.endsWith("/")) "$parent$name" else "$parent/$name"
}

internal fun workspaceNameForPath(folderPath: String): String {
    val segments = folderPath.split('/').filter { segment -> segment.isNotEmpty() }
    return segments.lastOrNull() ?: folderPath
}

internal fun folderNameFromUrl(url: String): String {
    val withoutScheme = url.trim()
        .trimEnd('/')
        .replace(Regex("^[a-zA-Z][a-zA-Z0-9+.-]*://"), "")
    val segments = withoutScheme.split('/', ':').filter { segment -> segment.isNotEmpty() }

    if (segments.size < 2) {
        return ""
    }

    return segments.last().removeSuffix(".git")
}
