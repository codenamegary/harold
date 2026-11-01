package harold.android.network

import harold.android.contracts.GitChanges
import harold.android.contracts.GitFileDiff
import harold.android.contracts.GitScope
import harold.android.contracts.GitSummary
import harold.android.contracts.GitWorktreeCollection

/**
 * Read-only git surface. The server routes are sketched in issue #468, but the
 * mock build binds this to [harold.android.changes.FixtureGitApi] so the UI can
 * be reviewed without a host endpoint.
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
