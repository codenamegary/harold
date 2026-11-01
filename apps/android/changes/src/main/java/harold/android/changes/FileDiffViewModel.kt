package harold.android.changes

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import harold.android.contracts.GitDiffLineKind
import harold.android.contracts.GitFileDiff
import harold.android.contracts.GitFileStatus
import harold.android.contracts.GitScope
import harold.android.network.GitApi
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class FileDiffUiState(
    val loading: Boolean = true,
    val error: String? = null,
    val worktreePath: String = "",
    val scope: GitScope = GitScope.Uncommitted,
    val filePath: String = "",
    val diff: GitFileDiff? = null,
) {
    val status: GitFileStatus?
        get() = diff?.status

    val additions: Int
        get() = diff?.additions ?: diff?.hunks.orEmpty()
            .flatMap { hunk -> hunk.lines }
            .count { line -> line.kind == GitDiffLineKind.Addition }

    val deletions: Int
        get() = diff?.deletions ?: diff?.hunks.orEmpty()
            .flatMap { hunk -> hunk.lines }
            .count { line -> line.kind == GitDiffLineKind.Deletion }
}

@HiltViewModel
class FileDiffViewModel @Inject constructor(
    private val gitApi: GitApi,
) : ViewModel() {
    private val _uiState = MutableStateFlow(FileDiffUiState())
    val uiState: StateFlow<FileDiffUiState> = _uiState.asStateFlow()

    private var startedKey: String? = null
    private var lastServerOrigin: String = ""
    private var lastWorktreePath: String = ""
    private var lastScope: GitScope = GitScope.Uncommitted
    private var lastFilePath: String = ""
    private var lastOldPath: String? = null

    fun start(
        serverOrigin: String,
        worktreePath: String,
        scope: GitScope,
        filePath: String,
        oldPath: String?,
    ) {
        lastServerOrigin = serverOrigin
        lastWorktreePath = worktreePath
        lastScope = scope
        lastFilePath = filePath
        lastOldPath = oldPath
        val key = "$serverOrigin|$worktreePath|$scope|$filePath|$oldPath"
        if (startedKey == key) {
            return
        }
        startedKey = key
        _uiState.value = FileDiffUiState(
            loading = true,
            worktreePath = worktreePath,
            scope = scope,
            filePath = filePath,
        )
        viewModelScope.launch {
            gitApi.getFileDiff(
                serverOrigin = serverOrigin,
                worktreePath = worktreePath,
                scope = scope,
                filePath = filePath,
                oldPath = oldPath,
            ).fold(
                onSuccess = { diff ->
                    _uiState.update {
                        it.copy(loading = false, error = null, diff = diff)
                    }
                },
                onFailure = { error ->
                    _uiState.update {
                        it.copy(
                            loading = false,
                            error = error.message ?: "Could not load this diff",
                        )
                    }
                },
            )
        }
    }

    fun retry() {
        if (lastFilePath.isEmpty()) {
            return
        }
        startedKey = null
        start(
            serverOrigin = lastServerOrigin,
            worktreePath = lastWorktreePath,
            scope = lastScope,
            filePath = lastFilePath,
            oldPath = lastOldPath,
        )
    }
}
