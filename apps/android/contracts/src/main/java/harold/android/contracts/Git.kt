package harold.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class GitScope {
    @SerialName("uncommitted")
    Uncommitted,

    @SerialName("branch")
    Branch,
}

@Serializable
enum class GitFileStatus {
    @SerialName("added")
    Added,

    @SerialName("modified")
    Modified,

    @SerialName("deleted")
    Deleted,

    @SerialName("renamed")
    Renamed,

    @SerialName("copied")
    Copied,

    @SerialName("type_changed")
    TypeChanged,

    @SerialName("untracked")
    Untracked,

    @SerialName("conflicted")
    Conflicted,
}

@Serializable
data class GitWorktree(
    val path: String,
    val branch: String?,
    val headSha: String,
    val isCurrent: Boolean,
    val isMain: Boolean,
    val dirtyFileCount: Int?,
)

@Serializable
data class GitWorktreeCollection(
    val items: List<GitWorktree>,
)

@Serializable
data class GitRepository(
    val root: String,
    val currentWorktreePath: String,
    val currentBranch: String?,
    val defaultBranch: String?,
    val headSha: String,
)

@Serializable
data class GitSummary(
    val repository: GitRepository,
    val uncommittedFileCount: Int,
)

@Serializable
data class GitChangedFile(
    val path: String,
    val oldPath: String? = null,
    val status: GitFileStatus,
    val additions: Int? = null,
    val deletions: Int? = null,
    val binary: Boolean = false,
    val submodule: Boolean = false,
)

@Serializable
data class GitChangesTotals(
    val files: Int,
    val additions: Int,
    val deletions: Int,
)

@Serializable
data class GitChanges(
    val scope: GitScope,
    val baseRef: String? = null,
    val mergeBaseSha: String? = null,
    val headSha: String,
    val files: List<GitChangedFile>,
    val totals: GitChangesTotals,
    val truncated: Boolean = false,
)

@Serializable
enum class GitDiffLineKind {
    @SerialName("context")
    Context,

    @SerialName("addition")
    Addition,

    @SerialName("deletion")
    Deletion,
}

@Serializable
data class GitDiffLine(
    val kind: GitDiffLineKind,
    val oldLineNumber: Int? = null,
    val newLineNumber: Int? = null,
    val text: String,
)

@Serializable
data class GitDiffHunk(
    val header: String,
    val oldStart: Int,
    val oldLines: Int,
    val newStart: Int,
    val newLines: Int,
    val lines: List<GitDiffLine>,
)

@Serializable
data class GitFileDiff(
    val path: String,
    val oldPath: String? = null,
    val status: GitFileStatus,
    val additions: Int? = null,
    val deletions: Int? = null,
    val binary: Boolean = false,
    val submodule: Boolean = false,
    val hunks: List<GitDiffHunk> = emptyList(),
    val truncated: Boolean = false,
)
