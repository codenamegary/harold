package harold.android.database.workspace

import harold.android.contracts.CreateWorkspaceBody
import harold.android.contracts.Workspace
import harold.android.network.AgentApi
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

data class CachedWorkspace(
    val serverOrigin: String,
    val workspace: Workspace,
)

interface WorkspaceRepository {
    fun observe(): Flow<List<CachedWorkspace>>

    fun observe(serverOrigin: String): Flow<List<CachedWorkspace>>

    suspend fun refresh(serverOrigin: String): Result<Unit>

    suspend fun create(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace>
}

class DefaultWorkspaceRepository @Inject constructor(
    private val agentApi: AgentApi,
    private val dao: WorkspaceDao,
) : WorkspaceRepository {
    override fun observe(): Flow<List<CachedWorkspace>> = dao.observeAll().map(::cached)

    override fun observe(serverOrigin: String): Flow<List<CachedWorkspace>> =
        dao.observeByOrigin(serverOrigin).map(::cached)

    override suspend fun refresh(serverOrigin: String): Result<Unit> {
        val listed = agentApi.listWorkspaces(serverOrigin, WORKSPACE_LIMIT)
        if (listed.isFailure) {
            return Result.failure(checkNotNull(listed.exceptionOrNull()))
        }
        val workspaces = listed.getOrThrow().items
        dao.replaceByOrigin(
            serverOrigin = serverOrigin,
            workspaces = workspaces.mapIndexed { position, workspace ->
                workspace.toEntity(serverOrigin, position)
            },
        )
        return Result.success(Unit)
    }

    override suspend fun create(
        serverOrigin: String,
        body: CreateWorkspaceBody,
    ): Result<Workspace> = agentApi.createWorkspace(serverOrigin, body).onSuccess { created ->
        dao.upsertAll(
            listOf(
                created.toEntity(
                    serverOrigin = serverOrigin,
                    position = dao.countByOrigin(serverOrigin),
                ),
            ),
        )
    }

    private fun cached(entities: List<WorkspaceEntity>): List<CachedWorkspace> = entities.map { entity ->
        CachedWorkspace(
            serverOrigin = entity.serverOrigin,
            workspace = entity.toWorkspace(),
        )
    }

    private companion object {
        const val WORKSPACE_LIMIT = 100
    }
}
