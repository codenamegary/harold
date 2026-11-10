package harold.android.chat

import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.database.session.SessionListItem
import harold.android.database.session.SessionCatalog
import harold.android.database.session.SessionRepository
import harold.android.network.AgentSessionSnapshot
import harold.android.network.CatalogSession
import harold.android.user.UserRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map

/**
 * Test double for the live session catalog facade. It reads from the same
 * [UserRepository] fake the view models used before the ACP runtime existed,
 * and keeps all session state in memory.
 */
class TestSessionRepository(
    private val network: UserRepository,
) : SessionRepository {
    private val sessions = MutableStateFlow<List<SessionListItem>>(emptyList())
    private val loading = MutableStateFlow<Set<Pair<String, AgentId>>>(emptySet())
    private val errors = MutableStateFlow<Map<Pair<String, AgentId>, String>>(emptyMap())

    override fun observeSessions(): Flow<List<SessionListItem>> = sessions

    override fun observeSessions(connectionId: String): Flow<List<SessionListItem>> =
        sessions.map { cached -> cached.filter { session -> session.connectionId == connectionId } }

    override fun observeSnapshots(): Flow<List<AgentSessionSnapshot>> =
        kotlinx.coroutines.flow.combine(sessions, loading, errors) { cached, refreshing, failures ->
            cached
                .groupBy { session -> session.connectionId to session.session.agentId }
                .map { (key, rows) ->
                    AgentSessionSnapshot(
                        connectionId = key.first,
                        agentId = key.second,
                        sessions = rows.map { row -> row.session.toCatalog() },
                        loading = key in refreshing,
                        error = failures[key],
                    )
                }
        }

    override suspend fun refresh(connectionId: String): Result<SessionCatalog> {
        val listed = network.listSessions(connectionId)
        if (listed.isFailure) {
            return Result.failure(checkNotNull(listed.exceptionOrNull()))
        }
        val agentItems = network.listAgents(connectionId).getOrNull()?.items.orEmpty()
        val workspaces = network.listWorkspaces(connectionId, 100).getOrNull()?.items.orEmpty()
        val agentLabels = agentItems.associate { agent -> agent.id to agent.displayName }
        val workspaceByPath = workspaces.associateBy { workspace -> workspace.path }
        val cached = listed.getOrThrow().items.map { session ->
            val workspace = workspaceByPath[session.cwd]
            SessionListItem(
                connectionId = connectionId,
                session = session,
                workspaceId = workspace?.id.orEmpty(),
                workspaceName = workspace?.name ?: session.cwd,
                agentLabel = agentLabels[session.agentId] ?: session.agentId,
            )
        }
        sessions.value = sessions.value.filterNot { session -> session.connectionId == connectionId } + cached
        return Result.success(
            SessionCatalog(
                agents = agentItems,
                workspaces = workspaces,
            ),
        )
    }

    override suspend fun createSession(
        connectionId: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse> = network.createSession(connectionId, body).onSuccess { created ->
        val workspace = network.listWorkspaces(connectionId, 100)
            .getOrNull()
            ?.items
            ?.firstOrNull { listed -> listed.path == created.cwd }
        sessions.value = sessions.value.filterNot { cached ->
            cached.connectionId == connectionId &&
                cached.session.agentId == created.agentId &&
                cached.session.sessionId == created.sessionId
        } + SessionListItem(
            connectionId = connectionId,
            session = created.toSession(),
            workspaceId = workspace?.id.orEmpty(),
            workspaceName = workspace?.name ?: created.cwd,
            agentLabel = created.agentId,
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

    fun seed(sessions: List<SessionListItem>) {
        this.sessions.value = sessions
    }

    fun markLoading(connectionId: String, agentId: AgentId) {
        loading.value = loading.value + (connectionId to agentId)
    }

    fun markFailed(connectionId: String, agentId: AgentId, message: String) {
        loading.value = loading.value - (connectionId to agentId)
        errors.value = errors.value + ((connectionId to agentId) to message)
    }
}

private fun harold.android.contracts.Session.toCatalog(): CatalogSession = CatalogSession(
    agentId = agentId,
    sessionId = sessionId,
    cwd = cwd,
    title = title,
    updatedAt = updatedAt,
)
