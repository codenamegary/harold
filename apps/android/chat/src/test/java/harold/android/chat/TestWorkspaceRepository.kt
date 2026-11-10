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

    override fun observe(connectionId: String): Flow<List<CachedWorkspace>> =
        workspaces.map { cached ->
            cached.filter { workspace -> workspace.connectionId == connectionId }
        }

    override suspend fun refresh(connectionId: String): Result<Unit> {
        val listed = network.listWorkspaces(connectionId, 100)
        if (listed.isFailure) {
            return Result.failure(checkNotNull(listed.exceptionOrNull()))
        }
        val cached = listed.getOrThrow().items.map { workspace ->
            CachedWorkspace(connectionId = connectionId, workspace = workspace)
        }
        workspaces.value = workspaces.value.filterNot { workspace ->
            workspace.connectionId == connectionId
        } + cached
        return Result.success(Unit)
    }

    override suspend fun create(
        connectionId: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> = network.createWorkspace(connectionId, body).onSuccess { created ->
        workspaces.value = workspaces.value.filterNot { cached ->
            cached.connectionId == connectionId && cached.workspace.id == created.id
        } + CachedWorkspace(connectionId = connectionId, workspace = created)
    }

    override suspend fun delete(
        connectionId: String,
        path: String,
    ): Result<Unit> {
        workspaces.value = workspaces.value.filterNot { cached ->
            cached.connectionId == connectionId && cached.workspace.path == path
        }
        return Result.success(Unit)
    }

    fun seed(connectionId: String, workspaces: List<Workspace>) {
        this.workspaces.value = this.workspaces.value.filterNot { cached ->
            cached.connectionId == connectionId
        } + workspaces.map { workspace ->
            CachedWorkspace(connectionId = connectionId, workspace = workspace)
        }
    }
}
