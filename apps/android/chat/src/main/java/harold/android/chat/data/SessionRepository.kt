package harold.android.chat.data

import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.Session
import harold.android.contracts.Workspace
import harold.android.network.AgentApi
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

data class CachedSession(
    val serverOrigin: String,
    val session: Session,
    val workspaceId: String,
    val workspaceName: String,
    val agentLabel: String,
)

data class CachedAgent(
    val serverOrigin: String,
    val agentId: AgentId,
    val displayName: String,
    val enabled: Boolean,
)

/**
 * Lists a caller already fetched for the same refresh cycle. Passing them keeps
 * chat from asking the server for agents and workspaces twice.
 */
data class SessionRefresh(
    val agents: List<AgentSettings>? = null,
    val workspaces: List<Workspace>? = null,
)

interface SessionRepository {
    fun observeSessions(): Flow<List<CachedSession>>

    fun observeSessions(serverOrigin: String): Flow<List<CachedSession>>

    fun observeAgents(serverOrigin: String): Flow<List<CachedAgent>>

    suspend fun refresh(
        serverOrigin: String,
        snapshot: SessionRefresh = SessionRefresh(),
    ): Result<Unit>

    suspend fun refreshAgents(serverOrigin: String): Result<Unit>

    suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse>

    suspend fun deleteSession(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit>
}

class DefaultSessionRepository @Inject constructor(
    private val agentApi: AgentApi,
    private val sessionDao: SessionDao,
    private val agentDao: AgentDao,
) : SessionRepository {
    override fun observeSessions(): Flow<List<CachedSession>> =
        sessionDao.observeAll().map(::cachedSessions)

    override fun observeSessions(serverOrigin: String): Flow<List<CachedSession>> =
        sessionDao.observeByOrigin(serverOrigin).map(::cachedSessions)

    override fun observeAgents(serverOrigin: String): Flow<List<CachedAgent>> =
        agentDao.observeByOrigin(serverOrigin).map { agents ->
            agents.map { agent ->
                CachedAgent(
                    serverOrigin = agent.serverOrigin,
                    agentId = agent.agentId,
                    displayName = agent.displayName,
                    enabled = agent.enabled,
                )
            }
        }

    override suspend fun refresh(
        serverOrigin: String,
        snapshot: SessionRefresh,
    ): Result<Unit> {
        val sessionsResult = agentApi.listSessions(serverOrigin)
        if (sessionsResult.isFailure) {
            return Result.failure(checkNotNull(sessionsResult.exceptionOrNull()))
        }

        val snapshotAgents = snapshot.agents
        if (snapshotAgents != null) {
            cacheAgents(serverOrigin, snapshotAgents)
        } else {
            refreshAgents(serverOrigin)
        }
        val workspaces = snapshot.workspaces
            ?: agentApi.listWorkspaces(serverOrigin, WORKSPACE_LIMIT).getOrNull()?.items

        val agentLabels = agentDao.agents(serverOrigin)
            .associate { agent -> agent.agentId to agent.displayName }

        val workspaceByPath = workspaces?.associateBy { workspace -> workspace.path }
        val cachedWorkspaceByPath = sessionDao.sessions(serverOrigin).associate { session ->
            session.cwd to WorkspaceLabels(
                id = session.workspaceId,
                name = session.workspaceName,
            )
        }

        sessionDao.replaceByOrigin(
            serverOrigin = serverOrigin,
            sessions = sessionsResult.getOrThrow().items.map { session ->
                val workspace = workspaceByPath?.get(session.cwd)
                val cachedWorkspace = cachedWorkspaceByPath[session.cwd]
                session.toEntity(
                    serverOrigin = serverOrigin,
                    workspaceId = workspace?.id ?: cachedWorkspace?.id.orEmpty(),
                    workspaceName = workspace?.name ?: cachedWorkspace?.name ?: session.cwd,
                    agentLabel = agentLabels[session.agentId] ?: session.agentId,
                )
            },
        )
        return Result.success(Unit)
    }

    override suspend fun refreshAgents(serverOrigin: String): Result<Unit> {
        val result = agentApi.listAgents(serverOrigin)
        if (result.isFailure) {
            return Result.failure(checkNotNull(result.exceptionOrNull()))
        }
        cacheAgents(serverOrigin, result.getOrThrow().items)
        return Result.success(Unit)
    }

    private suspend fun cacheAgents(
        serverOrigin: String,
        agents: List<AgentSettings>,
    ) {
        agentDao.replaceByOrigin(
            serverOrigin = serverOrigin,
            agents = agents.mapIndexed { position, agent ->
                agent.toEntity(serverOrigin, position)
            },
        )
    }

    override suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> =
        agentApi.createSession(serverOrigin, body).onSuccess { created ->
            val cachedAgent = agentDao.agents(serverOrigin)
                .firstOrNull { agent -> agent.agentId == created.agentId }
            val cachedWorkspace = sessionDao.sessions(serverOrigin)
                .firstOrNull { session -> session.cwd == created.cwd }
            sessionDao.upsertAll(
                listOf(
                    created.toSession().toEntity(
                        serverOrigin = serverOrigin,
                        workspaceId = cachedWorkspace?.workspaceId.orEmpty(),
                        workspaceName = cachedWorkspace?.workspaceName ?: created.cwd,
                        agentLabel = cachedAgent?.displayName ?: created.agentId,
                    ),
                ),
            )
        }

    override suspend fun deleteSession(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = agentApi.deleteSession(serverOrigin, agentId, sessionId).onSuccess {
        sessionDao.delete(serverOrigin, agentId, sessionId)
    }

    private fun cachedSessions(entities: List<SessionEntity>): List<CachedSession> =
        entities.map { entity ->
            CachedSession(
                serverOrigin = entity.serverOrigin,
                session = entity.toSession(),
                workspaceId = entity.workspaceId,
                workspaceName = entity.workspaceName,
                agentLabel = entity.agentLabel,
            )
        }

    private data class WorkspaceLabels(
        val id: String,
        val name: String,
    )

    private companion object {
        const val WORKSPACE_LIMIT = 100
    }
}

private fun AgentSettings.toEntity(
    serverOrigin: String,
    position: Int,
): AgentEntity = AgentEntity(
    serverOrigin = serverOrigin,
    agentId = id,
    displayName = displayName,
    available = available,
    enabled = enabled,
    path = path,
    position = position,
)

private fun Session.toEntity(
    serverOrigin: String,
    workspaceId: String,
    workspaceName: String,
    agentLabel: String,
): SessionEntity = SessionEntity(
    serverOrigin = serverOrigin,
    agentId = agentId,
    sessionId = sessionId,
    cwd = cwd,
    title = title,
    updatedAt = updatedAt,
    workspaceId = workspaceId,
    workspaceName = workspaceName,
    agentLabel = agentLabel,
)

