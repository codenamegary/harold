package harold.android.network

import harold.android.contracts.GitChanges
import harold.android.contracts.GitFileDiff
import harold.android.contracts.GitScope
import harold.android.contracts.GitSummary
import harold.android.contracts.GitWorktreeCollection

/**
 * Read-only git surface for the Changes feature. The routes are path-scoped and
 * authenticated, matching the `/v1/git/...` routes.
 */
interface GitApi {
    suspend fun getSummary(
        serverOrigin: String,
        path: String,
    ): Result<GitSummary>

    suspend fun listWorktrees(
        serverOrigin: String,
        path: String,
    ): Result<GitWorktreeCollection>

    suspend fun getChanges(
        serverOrigin: String,
        path: String,
        scope: GitScope,
    ): Result<GitChanges>

    suspend fun getFileDiff(
        serverOrigin: String,
        worktreePath: String,
        scope: GitScope,
        filePath: String,
        oldPath: String? = null,
    ): Result<GitFileDiff>
}
