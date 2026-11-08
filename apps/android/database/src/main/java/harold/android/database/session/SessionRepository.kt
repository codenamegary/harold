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
    val connectionId: String,
    val session: Session,
    val workspaceId: String,
    val workspaceName: String,
    val agentLabel: String,
)

data class CachedAgent(
    val connectionId: String,
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

    fun observeSessions(connectionId: String): Flow<List<CachedSession>>

    fun observeAgents(connectionId: String): Flow<List<CachedAgent>>

    suspend fun refresh(connectionId: String): Result<SessionCatalog>

    suspend fun refreshAgents(connectionId: String): Result<Unit>

    suspend fun createSession(
        connectionId: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse>

    suspend fun deleteSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit>

    suspend fun updateWorktreePath(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        worktreePath: String?,
    )
}

/**
 * App-local memory of the worktree a session is reviewed in. ACP knows
 * nothing about worktrees, so this never leaves the phone.
 */
interface SessionWorktreePathStore {
    suspend fun saveWorktreePath(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        worktreePath: String?,
    ): Result<Unit>
}

class DefaultSessionRepository @Inject constructor(
    private val agentApi: AgentApi,
    private val workspaceRepository: WorkspaceRepository,
    private val sessionDao: SessionDao,
    private val agentDao: AgentDao,
) : SessionRepository, SessionWorktreePathStore {
    override fun observeSessions(): Flow<List<CachedSession>> =
        sessionDao.observeAll().map(::cachedSessions)

    override fun observeSessions(connectionId: String): Flow<List<CachedSession>> =
        sessionDao.observeByOrigin(connectionId).map(::cachedSessions)

    override fun observeAgents(connectionId: String): Flow<List<CachedAgent>> =
        agentDao.observeByOrigin(connectionId).map { agents ->
            agents.map { agent ->
                CachedAgent(
                    connectionId = agent.connectionId,
                    agentId = agent.agentId,
                    displayName = agent.displayName,
                    enabled = agent.enabled,
                )
            }
        }

    override suspend fun refresh(connectionId: String): Result<SessionCatalog> {
        val sessionsResult = agentApi.listSessions(connectionId)
        if (sessionsResult.isFailure) {
            return Result.failure(checkNotNull(sessionsResult.exceptionOrNull()))
        }

        val agents = fetchAgents(connectionId).getOrNull().orEmpty()

        // Workspace labels feed the session rows. Refresh the shared workspace
        // cache when the server answers, and label from cache when it does not.
        workspaceRepository.refresh(connectionId)
        val workspaces = workspaceRepository.observe(connectionId).first()
            .map { cached -> cached.workspace }

        val agentLabels = agentDao.agents(connectionId)
            .associate { agent -> agent.agentId to agent.displayName }

        val workspaceByPath = workspaces.associateBy { workspace -> workspace.path }
        val cachedSessions = sessionDao.sessions(connectionId)
        val cachedWorkspaceByPath = cachedSessions.associate { session ->
            session.cwd to WorkspaceLabels(
                id = session.workspaceId,
                name = session.workspaceName,
            )
        }
        val cachedWorktreeBySession = cachedSessions.associate { session ->
            (session.agentId to session.sessionId) to session.worktreePath
        }

        sessionDao.replaceByOrigin(
            connectionId = connectionId,
            sessions = sessionsResult.getOrThrow().items.map { session ->
                val workspace = workspaceByPath[session.cwd]
                val cachedWorkspace = cachedWorkspaceByPath[session.cwd]
                session.toEntity(
                    connectionId = connectionId,
                    workspaceId = workspace?.id ?: cachedWorkspace?.id.orEmpty(),
                    workspaceName = workspace?.name ?: cachedWorkspace?.name ?: session.cwd,
                    agentLabel = agentLabels[session.agentId] ?: session.agentId,
                    // ACP does not report worktrees. Keep the phone-local
                    // choice unless a transport explicitly supplied one.
                    worktreePath = session.worktreePath
                        ?: cachedWorktreeBySession[session.agentId to session.sessionId],
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

    override suspend fun refreshAgents(connectionId: String): Result<Unit> =
        fetchAgents(connectionId).map { }

    private suspend fun fetchAgents(connectionId: String): Result<List<AgentSettings>> {
        val result = agentApi.listAgents(connectionId)
        if (result.isFailure) {
            return Result.failure(checkNotNull(result.exceptionOrNull()))
        }
        val agents = result.getOrThrow().items
        cacheAgents(connectionId, agents)
        return Result.success(agents)
    }

    private suspend fun cacheAgents(
        connectionId: String,
        agents: List<AgentSettings>,
    ) {
        agentDao.replaceByOrigin(
            connectionId = connectionId,
            agents = agents.mapIndexed { position, agent ->
                agent.toEntity(connectionId, position)
            },
        )
    }

    override suspend fun createSession(
        connectionId: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> =
        agentApi.createSession(connectionId, body).onSuccess { created ->
            val cachedAgent = agentDao.agents(connectionId)
                .firstOrNull { agent -> agent.agentId == created.agentId }
            val cachedWorkspace = workspaceRepository.observe(connectionId).first()
                .map { workspace -> workspace.workspace }
                .firstOrNull { workspace -> workspace.path == created.cwd }
            val cachedSession = sessionDao.sessions(connectionId)
                .firstOrNull { session -> session.cwd == created.cwd }
            sessionDao.upsertAll(
                listOf(
                    created.toSession().toEntity(
                        connectionId = connectionId,
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
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = agentApi.deleteSession(connectionId, agentId, sessionId).onSuccess {
        sessionDao.delete(connectionId, agentId, sessionId)
    }

    override suspend fun updateWorktreePath(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        worktreePath: String?,
    ) {
        sessionDao.updateWorktreePath(connectionId, agentId, sessionId, worktreePath)
    }

    override suspend fun saveWorktreePath(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        worktreePath: String?,
    ): Result<Unit> {
        sessionDao.updateWorktreePath(connectionId, agentId, sessionId, worktreePath)
        return Result.success(Unit)
    }

    private fun cachedSessions(entities: List<SessionEntity>): List<CachedSession> =
        entities.map { entity ->
            CachedSession(
                connectionId = entity.connectionId,
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
    connectionId: String,
    position: Int,
): AgentEntity = AgentEntity(
    connectionId = connectionId,
    agentId = id,
    displayName = displayName,
    available = available,
    enabled = enabled,
    path = path,
    position = position,
)

private fun Session.toEntity(
    connectionId: String,
    workspaceId: String,
    workspaceName: String,
    agentLabel: String,
    worktreePath: String? = this.worktreePath,
): SessionEntity = SessionEntity(
    connectionId = connectionId,
    agentId = agentId,
    sessionId = sessionId,
    cwd = cwd,
    title = title,
    updatedAt = updatedAt,
    workspaceId = workspaceId,
    workspaceName = workspaceName,
    agentLabel = agentLabel,
    worktreePath = worktreePath,
)

