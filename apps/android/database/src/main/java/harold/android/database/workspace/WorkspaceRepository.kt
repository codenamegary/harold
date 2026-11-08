package harold.android.database.workspace

import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.Workspace
import harold.android.network.WorkspaceApi
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

data class CachedWorkspace(
    val connectionId: String,
    val workspace: Workspace,
)

interface WorkspaceRepository {
    fun observe(): Flow<List<CachedWorkspace>>

    fun observe(connectionId: String): Flow<List<CachedWorkspace>>

    suspend fun refresh(connectionId: String): Result<Unit>

    suspend fun create(
        connectionId: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace>
}

class DefaultWorkspaceRepository @Inject constructor(
    private val agentApi: WorkspaceApi,
    private val dao: WorkspaceDao,
) : WorkspaceRepository {
    override fun observe(): Flow<List<CachedWorkspace>> = dao.observeAll().map(::cached)

    override fun observe(connectionId: String): Flow<List<CachedWorkspace>> =
        dao.observeByOrigin(connectionId).map(::cached)

    override suspend fun refresh(connectionId: String): Result<Unit> {
        val listed = agentApi.listWorkspaces(connectionId, WORKSPACE_LIMIT)
        if (listed.isFailure) {
            return Result.failure(checkNotNull(listed.exceptionOrNull()))
        }
        val workspaces = listed.getOrThrow().items
        dao.replaceByOrigin(
            connectionId = connectionId,
            workspaces = workspaces.mapIndexed { position, workspace ->
                workspace.toEntity(connectionId, position)
            },
        )
        return Result.success(Unit)
    }

    override suspend fun create(
        connectionId: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> = agentApi.createWorkspace(connectionId, body).onSuccess { created ->
        dao.upsertAll(
            listOf(
                created.toEntity(
                    connectionId = connectionId,
                    position = dao.countByOrigin(connectionId),
                ),
            ),
        )
    }

    private fun cached(entities: List<WorkspaceEntity>): List<CachedWorkspace> = entities.map { entity ->
        CachedWorkspace(
            connectionId = entity.connectionId,
            workspace = entity.toWorkspace(),
        )
    }

    private companion object {
        const val WORKSPACE_LIMIT = 100
    }
}
