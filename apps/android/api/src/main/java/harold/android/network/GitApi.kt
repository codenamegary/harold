package harold.android.network

import harold.android.contracts.GitChanges
import harold.android.contracts.GitFileDiff
import harold.android.contracts.GitScope
import harold.android.contracts.GitSummary
import harold.android.contracts.GitWorktreeCollection

/** Read-only git surface for the Changes feature, executed over SSH. */
interface GitApi {
    suspend fun getSummary(
        connectionId: String,
        path: String,
    ): Result<GitSummary>

    suspend fun listWorktrees(
        connectionId: String,
        path: String,
    ): Result<GitWorktreeCollection>

    suspend fun getChanges(
        connectionId: String,
        path: String,
        scope: GitScope,
    ): Result<GitChanges>

    suspend fun getFileDiff(
        connectionId: String,
        worktreePath: String,
        scope: GitScope,
        filePath: String,
        oldPath: String? = null,
    ): Result<GitFileDiff>
}
