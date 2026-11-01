package harold.android.changes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.contracts.GitChanges
import harold.android.contracts.GitRepository
import harold.android.contracts.GitScope
import harold.android.contracts.GitWorktree
import harold.android.network.GitApi
import harold.android.network.apiErrorMessage
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class ChangesGroup(
    val changes: GitChanges,
)

data class ChangesUiState(
    val loading: Boolean = true,
    val refreshing: Boolean = false,
    val error: String? = null,
    val repository: GitRepository? = null,
    val worktrees: List<GitWorktree> = emptyList(),
    val selectedWorktreePath: String = "",
    val scope: GitScope = GitScope.Uncommitted,
    val uncommitted: ChangesGroup? = null,
    val branch: ChangesGroup? = null,
    val collapsedFolders: Set<String> = emptySet(),
    val worktreeSheetVisible: Boolean = false,
) {
    val branchScopeAvailable: Boolean
        get() = repository?.let { repo ->
            repo.currentBranch != null &&
                repo.defaultBranch != null &&
                repo.currentBranch != repo.defaultBranch
        } == true

    val activeGroup: ChangesGroup?
        get() = if (scope == GitScope.Uncommitted) uncommitted else branch

    val selectedWorktree: GitWorktree?
        get() = worktrees.firstOrNull { it.path == selectedWorktreePath }

    val baseBranchLabel: String
        get() = repository?.defaultBranch ?: "base"

    val branchLabel: String
        get() = repository?.let { repo ->
            repo.currentBranch ?: "detached @ ${repo.headSha.take(7)}"
        } ?: ""

    val files get() = activeGroup?.changes?.files.orEmpty()
}

@HiltViewModel
class ChangesViewModel @Inject constructor(
    private val gitApi: GitApi,
) : ViewModel() {
    private val _uiState = MutableStateFlow(ChangesUiState())
    val uiState: StateFlow<ChangesUiState> = _uiState.asStateFlow()

    private var startedKey: String? = null
    private var serverOrigin: String = ""
    private var cwd: String = ""
    private var loadJob: Job? = null
    private var refreshJob: Job? = null

    fun start(serverOrigin: String, cwd: String) {
        val key = "$serverOrigin|$cwd"
        if (startedKey == key) {
            return
        }
        startedKey = key
        this.serverOrigin = serverOrigin
        this.cwd = cwd
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            _uiState.update {
                it.copy(loading = true, refreshing = false, error = null)
            }
            val summary = runCatching {
                gitApi.getSummary(serverOrigin, cwd).getOrThrow()
            }.getOrElse { error ->
                showInitialError(error)
                return@launch
            }
            val worktrees = runCatching {
                gitApi.listWorktrees(serverOrigin, cwd).getOrThrow().items
            }.getOrElse { error ->
                showInitialError(error)
                return@launch
            }
            val selectedPath = summary.repository.currentWorktreePath
            val repository = if (selectedPath == cwd) {
                summary.repository
            } else {
                runCatching {
                    gitApi.getSummary(serverOrigin, selectedPath).getOrThrow().repository
                }.getOrElse { summary.repository }
            }
            loadGroups(
                selectedPath = selectedPath,
                repository = repository,
                worktrees = worktrees,
            )
        }
    }

    fun refresh() {
        if (startedKey == null || refreshJob?.isActive == true) {
            return
        }
        refreshJob = viewModelScope.launch {
            _uiState.update { it.copy(refreshing = true, error = null) }
            val summary = runCatching {
                gitApi.getSummary(serverOrigin, cwd).getOrThrow()
            }.getOrNull()
            val worktrees = runCatching {
                gitApi.listWorktrees(serverOrigin, cwd).getOrThrow().items
            }.getOrNull()
            val selectedPath = _uiState.value.selectedWorktreePath
                .ifEmpty { summary?.repository?.currentWorktreePath.orEmpty() }
            if (selectedPath.isEmpty()) {
                _uiState.update {
                    it.copy(
                        refreshing = false,
                        loading = false,
                        error = "Could not load changes",
                    )
                }
                return@launch
            }
            val repository = runCatching {
                gitApi.getSummary(serverOrigin, selectedPath).getOrThrow().repository
            }.getOrElse { _uiState.value.repository ?: return@launch }
            reloadSelected(
                selectedPath = selectedPath,
                repository = repository,
                worktrees = worktrees ?: _uiState.value.worktrees,
                initial = false,
            )
        }
    }

    fun onResume() {
        if (startedKey == null || refreshJob?.isActive == true) {
            return
        }
        refreshJob = viewModelScope.launch {
            val selectedPath = _uiState.value.selectedWorktreePath
            if (selectedPath.isEmpty()) {
                return@launch
            }
            val repository = runCatching {
                gitApi.getSummary(serverOrigin, selectedPath).getOrThrow().repository
            }.getOrNull()
            val scope = _uiState.value.scope
            val group = runCatching {
                gitApi.getChanges(serverOrigin, selectedPath, scope).getOrThrow()
            }.getOrNull()
            _uiState.update { current ->
                if (repository == null || group == null) {
                    current
                } else {
                    current.copy(
                        repository = repository,
                        uncommitted = if (scope == GitScope.Uncommitted) {
                            ChangesGroup(group)
                        } else {
                            current.uncommitted
                        },
                        branch = if (scope == GitScope.Branch) {
                            ChangesGroup(group)
                        } else {
                            current.branch
                        },
                        error = null,
                    )
                }
            }
        }
    }

    fun selectWorktree(path: String) {
        val state = _uiState.value
        if (path == state.selectedWorktreePath) {
            _uiState.update { it.copy(worktreeSheetVisible = false) }
            return
        }
        _uiState.update {
            it.copy(
                worktreeSheetVisible = false,
                selectedWorktreePath = path,
                scope = GitScope.Uncommitted,
                uncommitted = null,
                branch = null,
                loading = true,
                error = null,
            )
        }
        loadJob?.cancel()
        loadJob = viewModelScope.launch {
            val repository = runCatching {
                gitApi.getSummary(serverOrigin, path).getOrThrow().repository
            }.getOrElse { error ->
                showInitialError(error)
                return@launch
            }
            loadGroups(
                selectedPath = path,
                repository = repository,
                worktrees = state.worktrees,
            )
        }
    }

    fun selectScope(scope: GitScope) {
        if (scope == GitScope.Branch && !_uiState.value.branchScopeAvailable) {
            return
        }
        _uiState.update { it.copy(scope = scope) }
    }

    fun toggleFolder(path: String) {
        _uiState.update { current ->
            val collapsed = current.collapsedFolders
            current.copy(
                collapsedFolders = if (path in collapsed) {
                    collapsed - path
                } else {
                    collapsed + path
                },
            )
        }
    }

    fun toggleAllFolders(folderPaths: Set<String>) {
        _uiState.update { current ->
            current.copy(
                collapsedFolders = if (current.collapsedFolders.containsAll(folderPaths)) {
                    current.collapsedFolders - folderPaths
                } else {
                    current.collapsedFolders + folderPaths
                },
            )
        }
    }

    fun showWorktreeSheet() {
        _uiState.update { it.copy(worktreeSheetVisible = true) }
    }

    fun hideWorktreeSheet() {
        _uiState.update { it.copy(worktreeSheetVisible = false) }
    }

    fun retry() {
        if (startedKey == null) {
            return
        }
        startedKey = null
        start(serverOrigin, cwd)
    }

    private suspend fun loadGroups(
        selectedPath: String,
        repository: GitRepository,
        worktrees: List<GitWorktree>,
    ) {
        val branchAvailable = repository.currentBranch != null &&
            repository.defaultBranch != null &&
            repository.currentBranch != repository.defaultBranch
        val groups = coroutineScope {
            listOfNotNull(
                GitScope.Uncommitted,
                GitScope.Branch.takeIf { branchAvailable },
            ).map { scope ->
                async {
                    scope to runCatching {
                        gitApi.getChanges(serverOrigin, selectedPath, scope).getOrThrow()
                    }
                }
            }.awaitAll()
        }
        val uncommitted = groups.firstOrNull { it.first == GitScope.Uncommitted }?.second?.getOrNull()
        val branch = groups.firstOrNull { it.first == GitScope.Branch }?.second?.getOrNull()
        val failure = groups.firstOrNull { it.second.isFailure }?.second?.exceptionOrNull()
        _uiState.update { current ->
            current.copy(
                loading = false,
                refreshing = false,
                error = failure?.let { apiErrorMessage(it) },
                repository = repository,
                worktrees = sortWorktrees(worktrees),
                selectedWorktreePath = selectedPath,
                scope = if (current.scope == GitScope.Branch && !branchAvailable) {
                    GitScope.Uncommitted
                } else {
                    current.scope
                },
                uncommitted = uncommitted?.let(::ChangesGroup),
                branch = branch?.let(::ChangesGroup),
            )
        }
    }

    private suspend fun reloadSelected(
        selectedPath: String,
        repository: GitRepository,
        worktrees: List<GitWorktree>,
        initial: Boolean,
    ) {
        val branchAvailable = repository.currentBranch != null &&
            repository.defaultBranch != null &&
            repository.currentBranch != repository.defaultBranch
        val activeScope = _uiState.value.scope
        val scopes = if (initial) {
            listOfNotNull(GitScope.Uncommitted, GitScope.Branch.takeIf { branchAvailable })
        } else {
            listOf(activeScope)
        }
        val groups = coroutineScope {
            scopes.map { scope ->
                async {
                    scope to runCatching {
                        gitApi.getChanges(serverOrigin, selectedPath, scope).getOrThrow()
                    }
                }
            }.awaitAll()
        }
        val failure = groups.firstOrNull { it.second.isFailure }?.second?.exceptionOrNull()
        _uiState.update { current ->
            val uncommitted = groups.firstOrNull { it.first == GitScope.Uncommitted }
                ?.second?.getOrNull()?.let(::ChangesGroup) ?: current.uncommitted
            val branch = groups.firstOrNull { it.first == GitScope.Branch }
                ?.second?.getOrNull()?.let(::ChangesGroup) ?: current.branch
            current.copy(
                loading = false,
                refreshing = false,
                error = failure?.let { apiErrorMessage(it) },
                repository = repository,
                worktrees = sortWorktrees(worktrees),
                selectedWorktreePath = selectedPath,
                uncommitted = uncommitted,
                branch = if (branchAvailable) branch else null,
            )
        }
    }

    private fun showInitialError(error: Throwable) {
        _uiState.update {
            it.copy(
                loading = false,
                refreshing = false,
                error = apiErrorMessage(error),
            )
        }
    }

    private fun sortWorktrees(worktrees: List<GitWorktree>): List<GitWorktree> =
        worktrees.sortedWith(
            compareByDescending<GitWorktree> { it.isCurrent }
                .thenByDescending { it.isMain }
                .thenBy { it.branch ?: it.headSha },
        )
}
