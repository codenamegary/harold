package harold.android.chat

import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.Workspace
import harold.android.database.workspace.CachedWorkspace
import harold.android.database.workspace.WorkspaceRepository
import harold.android.user.UserRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/**
 * Test double for the shared workspace cache. The network side stays the same
 * [UserRepository] fake so existing create-session tests keep one data source.
 */
class TestWorkspaceRepository(
    private val network: UserRepository,
) : WorkspaceRepository {
    private val workspaces = MutableStateFlow<List<CachedWorkspace>>(emptyList())

    override fun observe(): Flow<List<CachedWorkspace>> = workspaces

    override fun observe(serverOrigin: String): Flow<List<CachedWorkspace>> =
        workspaces.map { cached ->
            cached.filter { workspace -> workspace.serverOrigin == serverOrigin }
        }

    override suspend fun refresh(serverOrigin: String): Result<Unit> {
        val listed = network.listWorkspaces(serverOrigin, 100)
        if (listed.isFailure) {
            return Result.failure(checkNotNull(listed.exceptionOrNull()))
        }
        val cached = listed.getOrThrow().items.map { workspace ->
            CachedWorkspace(serverOrigin = serverOrigin, workspace = workspace)
        }
        workspaces.value = workspaces.value.filterNot { workspace ->
            workspace.serverOrigin == serverOrigin
        } + cached
        return Result.success(Unit)
    }

    override suspend fun create(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> = network.createWorkspace(serverOrigin, body).onSuccess { created ->
        workspaces.value = workspaces.value.filterNot { cached ->
            cached.serverOrigin == serverOrigin && cached.workspace.id == created.id
        } + CachedWorkspace(serverOrigin = serverOrigin, workspace = created)
    }

    fun seed(serverOrigin: String, workspaces: List<Workspace>) {
        this.workspaces.value = this.workspaces.value.filterNot { cached ->
            cached.serverOrigin == serverOrigin
        } + workspaces.map { workspace ->
            CachedWorkspace(serverOrigin = serverOrigin, workspace = workspace)
        }
    }
}
