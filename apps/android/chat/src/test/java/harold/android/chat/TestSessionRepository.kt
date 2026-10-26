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

    override fun observeSessions(serverOrigin: String): Flow<List<CachedSession>> =
        sessions.map { cached -> cached.filter { session -> session.serverOrigin == serverOrigin } }

    override fun observeAgents(serverOrigin: String): Flow<List<CachedAgent>> =
        agents.map { cached -> cached[serverOrigin].orEmpty() }

    override suspend fun refresh(serverOrigin: String): Result<SessionCatalog> {
        val listed = network.listSessions(serverOrigin)
        if (listed.isFailure) {
            return Result.failure(checkNotNull(listed.exceptionOrNull()))
        }
        val agentResult = network.listAgents(serverOrigin)
        val agentItems = agentResult.getOrNull()?.items.orEmpty()
        val workspaces = network.listWorkspaces(serverOrigin, 100).getOrNull()?.items.orEmpty()
        val agentLabels = agentItems.associate { agent -> agent.id to agent.displayName }
        val workspaceByPath = workspaces.associateBy { workspace -> workspace.path }
        val cached = listed.getOrThrow().items.map { session ->
            val workspace = workspaceByPath[session.cwd]
            CachedSession(
                serverOrigin = serverOrigin,
                session = session,
                workspaceId = workspace?.id.orEmpty(),
                workspaceName = workspace?.name ?: session.cwd,
                agentLabel = agentLabels[session.agentId] ?: session.agentId,
            )
        }
        sessions.value = sessions.value.filterNot { session -> session.serverOrigin == serverOrigin } + cached
        if (agentResult.isSuccess) {
            agents.value = agents.value + (
                serverOrigin to agentItems.map { agent ->
                    CachedAgent(
                        serverOrigin = serverOrigin,
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

    override suspend fun refreshAgents(serverOrigin: String): Result<Unit> {
        val listed = network.listAgents(serverOrigin)
        if (listed.isFailure) {
            return Result.failure(checkNotNull(listed.exceptionOrNull()))
        }
        agents.value = agents.value + (
            serverOrigin to listed.getOrThrow().items.map { agent ->
                CachedAgent(
                    serverOrigin = serverOrigin,
                    agentId = agent.id,
                    displayName = agent.displayName,
                    enabled = agent.enabled,
                )
            }
        )
        return Result.success(Unit)
    }

    override suspend fun createSession(
        serverOrigin: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> = network.createSession(serverOrigin, body).onSuccess { created ->
        val agent = agents.value[serverOrigin].orEmpty()
            .firstOrNull { cached -> cached.agentId == created.agentId }
        val workspace = network.listWorkspaces(serverOrigin, 100)
            .getOrNull()
            ?.items
            ?.firstOrNull { listed -> listed.path == created.cwd }
        sessions.value = sessions.value.filterNot { cached ->
            cached.serverOrigin == serverOrigin &&
                cached.session.agentId == created.agentId &&
                cached.session.sessionId == created.sessionId
        } + CachedSession(
            serverOrigin = serverOrigin,
            session = created.toSession(),
            workspaceId = workspace?.id.orEmpty(),
            workspaceName = workspace?.name ?: created.cwd,
            agentLabel = agent?.displayName ?: created.agentId,
        )
    }

    override suspend fun deleteSession(
        serverOrigin: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit> = network.deleteSession(serverOrigin, agentId, sessionId).onSuccess {
        sessions.value = sessions.value.filterNot { cached ->
            cached.serverOrigin == serverOrigin &&
                cached.session.agentId == agentId &&
                cached.session.sessionId == sessionId
        }
    }

    fun seed(sessions: List<CachedSession>) {
        this.sessions.value = sessions
    }

    fun seedAgents(serverOrigin: String, agents: List<CachedAgent>) {
        this.agents.value = this.agents.value + (serverOrigin to agents)
    }
}
