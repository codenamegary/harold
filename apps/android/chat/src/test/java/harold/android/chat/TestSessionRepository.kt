package harold.android.chat

import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.database.session.CachedAgent
import harold.android.database.session.CachedSession
import harold.android.database.session.SessionCatalog
import harold.android.database.session.SessionRepository
import harold.android.user.UserRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/**
 * Test double that exercises the session cache contract without Room. It reads
 * from the same [UserRepository] fake the view models used before caching.
 */
class TestSessionRepository(
    private val network: UserRepository,
) : SessionRepository {
    private val sessions = MutableStateFlow<List<CachedSession>>(emptyList())
    private val agents = MutableStateFlow<Map<String, List<CachedAgent>>>(emptyMap())

    override fun observeSessions(): Flow<List<CachedSession>> = sessions

    override fun observeSessions(connectionId: String): Flow<List<CachedSession>> =
        sessions.map { cached -> cached.filter { session -> session.connectionId == connectionId } }

    override fun observeAgents(connectionId: String): Flow<List<CachedAgent>> =
        agents.map { cached -> cached[connectionId].orEmpty() }

    override suspend fun refresh(connectionId: String): Result<SessionCatalog> {
        val listed = network.listSessions(connectionId)
        if (listed.isFailure) {
            return Result.failure(checkNotNull(listed.exceptionOrNull()))
        }
        val agentResult = network.listAgents(connectionId)
        val agentItems = agentResult.getOrNull()?.items.orEmpty()
        val workspaces = network.listWorkspaces(connectionId, 100).getOrNull()?.items.orEmpty()
        val agentLabels = agentItems.associate { agent -> agent.id to agent.displayName }
        val workspaceByPath = workspaces.associateBy { workspace -> workspace.path }
        val cached = listed.getOrThrow().items.map { session ->
            val workspace = workspaceByPath[session.cwd]
            CachedSession(
                connectionId = connectionId,
                session = session,
                workspaceId = workspace?.id.orEmpty(),
                workspaceName = workspace?.name ?: session.cwd,
                agentLabel = agentLabels[session.agentId] ?: session.agentId,
            )
        }
        sessions.value = sessions.value.filterNot { session -> session.connectionId == connectionId } + cached
        if (agentResult.isSuccess) {
            agents.value = agents.value + (
                connectionId to agentItems.map { agent ->
                    CachedAgent(
                        connectionId = connectionId,
                        agentId = agent.id,
                        displayName = agent.displayName,
                        enabled = agent.enabled,
                    )
                }
            )
        }
        return Result.success(
            SessionCatalog(
                agents = agentItems,
                workspaces = workspaces,
            ),
        )
    }

    override suspend fun refreshAgents(connectionId: String): Result<Unit> {
        val listed = network.listAgents(connectionId)
        if (listed.isFailure) {
            return Result.failure(checkNotNull(listed.exceptionOrNull()))
        }
        agents.value = agents.value + (
            connectionId to listed.getOrThrow().items.map { agent ->
                CachedAgent(
                    connectionId = connectionId,
                    agentId = agent.id,
                    displayName = agent.displayName,
                    enabled = agent.enabled,
                )
            }
        )
        return Result.success(Unit)
    }

    override suspend fun createSession(
        connectionId: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> = network.createSession(connectionId, body).onSuccess { created ->
        val agent = agents.value[connectionId].orEmpty()
            .firstOrNull { cached -> cached.agentId == created.agentId }
        val workspace = network.listWorkspaces(connectionId, 100)
            .getOrNull()
            ?.items
            ?.firstOrNull { listed -> listed.path == created.cwd }
        sessions.value = sessions.value.filterNot { cached ->
            cached.connectionId == connectionId &&
                cached.session.agentId == created.agentId &&
                cached.session.sessionId == created.sessionId
        } + CachedSession(
            connectionId = connectionId,
            session = created.toSession(),
            workspaceId = workspace?.id.orEmpty(),
            workspaceName = workspace?.name ?: created.cwd,
            agentLabel = agent?.displayName ?: created.agentId,
        )
    }

    override suspend fun deleteSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = network.deleteSession(connectionId, agentId, sessionId).onSuccess {
        sessions.value = sessions.value.filterNot { cached ->
            cached.connectionId == connectionId &&
                cached.session.agentId == agentId &&
                cached.session.sessionId == sessionId
        }
    }

    override suspend fun updateWorktreePath(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        worktreePath: String?,
    ) {
        sessions.value = sessions.value.map { cached ->
            if (
                cached.connectionId == connectionId &&
                cached.session.agentId == agentId &&
                cached.session.sessionId == sessionId
            ) {
                cached.copy(session = cached.session.copy(worktreePath = worktreePath))
            } else {
                cached
            }
        }
    }

    fun seed(sessions: List<CachedSession>) {
        this.sessions.value = sessions
    }

    fun seedAgents(connectionId: String, agents: List<CachedAgent>) {
        this.agents.value = this.agents.value + (connectionId to agents)
    }
}
