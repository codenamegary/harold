package harold.android.database.session

import harold.android.contracts.AgentId
import harold.android.contracts.AgentSettings
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.Session
import harold.android.contracts.Workspace
import harold.android.database.workspace.WorkspaceRepository
import harold.android.network.AcpAgentApi
import harold.android.network.AgentSessionSnapshot
import harold.android.network.CatalogSession
import harold.android.network.SessionCatalogReader
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

data class SessionListItem(
    val connectionId: String,
    val session: Session,
    val workspaceId: String,
    val workspaceName: String,
    val agentLabel: String,
)

/**
 * The live lists that a refresh read from the network. Chat uses them for
 * transient UI state that is not part of the Room cache, such as agent auth
 * summaries and attachment capabilities.
 */
data class SessionCatalog(
    val agents: List<AgentSettings> = emptyList(),
    val workspaces: List<Workspace> = emptyList(),
)

/**
 * Session rows composed from the live ACP catalog, the agent and workspace
 * caches, and the phone-local worktree choice. Nothing here persists session
 * history; the agent owns it.
 */
interface SessionRepository {
    fun observeSessions(): Flow<List<SessionListItem>>

    fun observeSessions(connectionId: String): Flow<List<SessionListItem>>

    /** Per-agent snapshots, including each agent's loading and error state. */
    fun observeSnapshots(): Flow<List<AgentSessionSnapshot>>

    suspend fun refresh(connectionId: String): Result<SessionCatalog>

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

data class StoredWorktreePath(
    val connectionId: String,
    val agentId: AgentId,
    val sessionId: String,
    val worktreePath: String,
)

/**
 * App-local memory of the worktree a session is reviewed in. ACP knows
 * nothing about worktrees, so this never leaves the phone.
 */
interface SessionWorktreePathStore {
    fun observeWorktreePaths(): Flow<List<StoredWorktreePath>> = emptyFlow()

    fun observeWorktreePaths(connectionId: String): Flow<List<StoredWorktreePath>> = emptyFlow()

    suspend fun saveWorktreePath(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        worktreePath: String?,
    ): Result<Unit>
}

class DefaultSessionWorktreePathStore @Inject constructor(
    private val dao: SessionWorktreePathDao,
) : SessionWorktreePathStore {
    override fun observeWorktreePaths(): Flow<List<StoredWorktreePath>> =
        dao.observeAll().map { rows -> rows.map(SessionWorktreePathEntity::toStored) }

    override fun observeWorktreePaths(connectionId: String): Flow<List<StoredWorktreePath>> =
        dao.observeAll().map { rows ->
            rows.filter { row -> row.connectionId == connectionId }.map(SessionWorktreePathEntity::toStored)
        }

    override suspend fun saveWorktreePath(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        worktreePath: String?,
    ): Result<Unit> = runCatching {
        if (worktreePath == null) {
            dao.delete(connectionId, agentId, sessionId)
        } else {
            dao.upsert(
                SessionWorktreePathEntity(
                    connectionId = connectionId,
                    agentId = agentId,
                    sessionId = sessionId,
                    worktreePath = worktreePath,
                ),
            )
        }
    }
}

class DefaultSessionRepository @Inject constructor(
    private val agentApi: AcpAgentApi,
    private val agentRepository: AgentRepository,
    private val workspaceRepository: WorkspaceRepository,
    private val catalog: SessionCatalogReader,
    private val worktreePaths: SessionWorktreePathStore,
) : SessionRepository {
    override fun observeSessions(): Flow<List<SessionListItem>> = sessionsFlow()

    override fun observeSessions(connectionId: String): Flow<List<SessionListItem>> =
        sessionsFlow().map { sessions ->
            sessions.filter { session -> session.connectionId == connectionId }
        }

    override fun observeSnapshots(): Flow<List<AgentSessionSnapshot>> =
        catalog.observeSnapshots()

    override suspend fun refresh(connectionId: String): Result<SessionCatalog> {
        val sessionsResult = agentApi.listSessions(connectionId)
        if (sessionsResult.isFailure) {
            return Result.failure(checkNotNull(sessionsResult.exceptionOrNull()))
        }

        val agents = agentRepository.refreshAgents(connectionId).getOrNull().orEmpty()
        workspaceRepository.refresh(connectionId)
        val workspaces = workspaceRepository.observe(connectionId).first()
            .map { cached -> cached.workspace }
        return Result.success(
            SessionCatalog(
                agents = agents,
                workspaces = workspaces,
            ),
        )
    }

    override suspend fun createSession(
        connectionId: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> = agentApi.createSession(connectionId, body)

    override suspend fun deleteSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = agentApi.deleteSession(connectionId, agentId, sessionId)

    override suspend fun updateWorktreePath(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        worktreePath: String?,
    ) {
        worktreePaths.saveWorktreePath(
            connectionId = connectionId,
            agentId = agentId,
            sessionId = sessionId,
            worktreePath = worktreePath,
        )
    }

    private fun sessionsFlow(): Flow<List<SessionListItem>> = combine(
        catalog.observeSnapshots(),
        worktreePaths.observeWorktreePaths(),
        workspaceRepository.observe(),
        agentRepository.observeAllAgents(),
    ) { snapshots, worktrees, workspaces, agents ->
        val workspaceByPath = workspaces.associate { cached ->
            (cached.connectionId to cached.workspace.path) to cached.workspace
        }
        val agentByKey = agents.associate { agent ->
            (agent.connectionId to agent.agentId) to agent
        }
        val worktreeByKey = worktrees.associate { path ->
            Triple(path.connectionId, path.agentId, path.sessionId) to path.worktreePath
        }

        snapshots.flatMap { snapshot ->
            snapshot.sessions.map { session ->
                val workspace = workspaceByPath[snapshot.connectionId to session.cwd]
                val agent = agentByKey[snapshot.connectionId to session.agentId]
                SessionListItem(
                    connectionId = snapshot.connectionId,
                    session = session.toContract(
                        worktreePath = worktreeByKey[
                            Triple(snapshot.connectionId, session.agentId, session.sessionId)
                        ],
                    ),
                    workspaceId = workspace?.id.orEmpty(),
                    workspaceName = workspace?.name ?: session.cwd,
                    agentLabel = agent?.displayName ?: session.agentId,
                )
            }
        }.sortedByDescending { cached -> cached.session.updatedAt }
    }
}

private fun SessionWorktreePathEntity.toStored(): StoredWorktreePath = StoredWorktreePath(
    connectionId = connectionId,
    agentId = agentId,
    sessionId = sessionId,
    worktreePath = worktreePath,
)

private fun CatalogSession.toContract(worktreePath: String?): Session = Session(
    agentId = agentId,
    sessionId = sessionId,
    cwd = cwd,
    title = title,
    updatedAt = updatedAt,
    worktreePath = worktreePath,
)
