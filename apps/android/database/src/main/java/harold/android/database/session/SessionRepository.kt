package harold.android.database.session

import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.Session
import harold.android.contracts.Workspace
import harold.android.database.workspace.WorkspaceRepository
import harold.android.network.AgentApi
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
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
 * The live lists that a refresh read from the server. Chat uses them for
 * transient UI state that is not part of the Room cache, such as agent auth
 * summaries and attachment capabilities.
 */
data class SessionCatalog(
    val agents: List<AgentSettings> = emptyList(),
    val workspaces: List<Workspace> = emptyList(),
)

interface SessionRepository {
    fun observeSessions(): Flow<List<CachedSession>>

    fun observeSessions(serverOrigin: String): Flow<List<CachedSession>>

    fun observeAgents(serverOrigin: String): Flow<List<CachedAgent>>

    suspend fun refresh(serverOrigin: String): Result<SessionCatalog>

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
    private val workspaceRepository: WorkspaceRepository,
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

    override suspend fun refresh(serverOrigin: String): Result<SessionCatalog> {
        val sessionsResult = agentApi.listSessions(serverOrigin)
        if (sessionsResult.isFailure) {
            return Result.failure(checkNotNull(sessionsResult.exceptionOrNull()))
        }

        val agents = fetchAgents(serverOrigin).getOrNull().orEmpty()

        // Workspace labels feed the session rows. Refresh the shared workspace
        // cache when the server answers, and label from cache when it does not.
        workspaceRepository.refresh(serverOrigin)
        val workspaces = workspaceRepository.observe(serverOrigin).first()
            .map { cached -> cached.workspace }

        val agentLabels = agentDao.agents(serverOrigin)
            .associate { agent -> agent.agentId to agent.displayName }

        val workspaceByPath = workspaces.associateBy { workspace -> workspace.path }
        val cachedWorkspaceByPath = sessionDao.sessions(serverOrigin).associate { session ->
            session.cwd to WorkspaceLabels(
                id = session.workspaceId,
                name = session.workspaceName,
            )
        }

        sessionDao.replaceByOrigin(
            serverOrigin = serverOrigin,
            sessions = sessionsResult.getOrThrow().items.map { session ->
                val workspace = workspaceByPath[session.cwd]
                val cachedWorkspace = cachedWorkspaceByPath[session.cwd]
                session.toEntity(
                    serverOrigin = serverOrigin,
                    workspaceId = workspace?.id ?: cachedWorkspace?.id.orEmpty(),
                    workspaceName = workspace?.name ?: cachedWorkspace?.name ?: session.cwd,
                    agentLabel = agentLabels[session.agentId] ?: session.agentId,
                )
            },
        )
        return Result.success(
            SessionCatalog(
                agents = agents,
                workspaces = workspaces,
            ),
        )
    }

    override suspend fun refreshAgents(serverOrigin: String): Result<Unit> =
        fetchAgents(serverOrigin).map { }

    private suspend fun fetchAgents(serverOrigin: String): Result<List<AgentSettings>> {
        val result = agentApi.listAgents(serverOrigin)
        if (result.isFailure) {
            return Result.failure(checkNotNull(result.exceptionOrNull()))
        }
        val agents = result.getOrThrow().items
        cacheAgents(serverOrigin, agents)
        return Result.success(agents)
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
            val cachedWorkspace = workspaceRepository.observe(serverOrigin).first()
                .map { workspace -> workspace.workspace }
                .firstOrNull { workspace -> workspace.path == created.cwd }
            val cachedSession = sessionDao.sessions(serverOrigin)
                .firstOrNull { session -> session.cwd == created.cwd }
            sessionDao.upsertAll(
                listOf(
                    created.toSession().toEntity(
                        serverOrigin = serverOrigin,
                        workspaceId = cachedWorkspace?.id ?: cachedSession?.workspaceId.orEmpty(),
                        workspaceName = cachedWorkspace?.name
                            ?: cachedSession?.workspaceName
                            ?: created.cwd,
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

