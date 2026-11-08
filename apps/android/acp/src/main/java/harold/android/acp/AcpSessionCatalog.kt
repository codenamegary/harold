package harold.android.acp

import harold.android.contracts.AgentId
import harold.android.network.AgentSessionSnapshot
import harold.android.network.CatalogSession
import harold.android.network.SessionCatalogReader
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map

/**
 * The session lists the live ACP processes have reported. This is a memory-only
 * view: agents own session history, the app just compiles their `session/list`
 * answers here so the UI, workspace hints, and opening a session's working
 * directory do not need a second catalog in Room.
 *
 * Each snapshot is owned by one `(connection, agent)` pair. Listing an agent
 * replaces only that agent's rows; process death removes only that agent's
 * rows for the saved connections that shared the process.
 */
@Singleton
class AcpSessionCatalog @Inject constructor() : SessionCatalogReader {
    private data class Key(
        val connectionId: String,
        val agentId: AgentId,
    )

    private val lock = Any()
    private val byKey = mutableMapOf<Key, AgentSessionSnapshot>()
    private val _snapshots = MutableStateFlow<List<AgentSessionSnapshot>>(emptyList())

    override fun observeSnapshots(): Flow<List<AgentSessionSnapshot>> = _snapshots.asStateFlow()

    override fun observeSnapshots(connectionId: String): Flow<List<AgentSessionSnapshot>> =
        _snapshots.map { snapshots ->
            snapshots.filter { snapshot -> snapshot.connectionId == connectionId }
        }

    override fun snapshots(): List<AgentSessionSnapshot> = _snapshots.value

    override fun sessions(connectionId: String): List<CatalogSession> =
        _snapshots.value
            .filter { snapshot -> snapshot.connectionId == connectionId }
            .flatMap { snapshot -> snapshot.sessions }

    override fun sessionDirectories(connectionId: String): List<String> =
        sessions(connectionId)
            .map { session -> session.cwd }
            .distinct()

    override fun find(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): CatalogSession? = synchronized(lock) {
        byKey[Key(connectionId, agentId)]
            ?.sessions
            ?.firstOrNull { session -> session.sessionId == sessionId }
    }

    fun snapshot(connectionId: String, agentId: AgentId): AgentSessionSnapshot? =
        synchronized(lock) { byKey[Key(connectionId, agentId)] }

    /** Marks [agentIds] as refreshing without clearing their previous rows. */
    fun markLoading(connectionId: String, agentIds: Collection<AgentId>) {
        synchronized(lock) {
            agentIds.forEach { agentId ->
                val key = Key(connectionId, agentId)
                val current = byKey[key] ?: AgentSessionSnapshot(
                    connectionId = connectionId,
                    agentId = agentId,
                )
                byKey[key] = current.copy(loading = true, error = null)
            }
            publishLocked()
        }
    }

    /** Replaces one agent's snapshot after a successful `session/list`. */
    fun replaceAgent(
        connectionId: String,
        agentId: AgentId,
        sessions: List<AcpSessionInfo>,
        cwd: String? = null,
    ) {
        synchronized(lock) {
            val key = Key(connectionId, agentId)
            val current = byKey[key] ?: AgentSessionSnapshot(
                connectionId = connectionId,
                agentId = agentId,
            )
            // A folder-scoped refresh replaces only that folder's rows.
            val kept = if (cwd == null) {
                emptyList()
            } else {
                current.sessions.filter { session -> session.cwd != cwd }
            }
            byKey[key] = current.copy(
                sessions = sortSessions(kept + sessions.map { session -> session.toCatalog() }),
                loading = false,
                error = null,
            )
            publishLocked()
        }
    }

    /** Keeps an agent's previous rows and records why this refresh failed. */
    fun markFailed(connectionId: String, agentId: AgentId, message: String?) {
        synchronized(lock) {
            val key = Key(connectionId, agentId)
            val current = byKey[key] ?: AgentSessionSnapshot(
                connectionId = connectionId,
                agentId = agentId,
            )
            byKey[key] = current.copy(loading = false, error = message)
            publishLocked()
        }
    }

    /** Drops snapshots for agents that are no longer enabled on this host. */
    fun retainAgents(connectionId: String, agentIds: Set<AgentId>) {
        synchronized(lock) {
            val removed = byKey.keys.filter { key ->
                key.connectionId == connectionId && key.agentId !in agentIds
            }
            removed.forEach(byKey::remove)
            if (removed.isNotEmpty()) {
                publishLocked()
            }
        }
    }

    /** Adds or replaces one session in its agent's snapshot. */
    fun upsert(connectionId: String, session: AcpSessionInfo) {
        synchronized(lock) {
            val key = Key(connectionId, session.agentId)
            val current = byKey[key] ?: AgentSessionSnapshot(
                connectionId = connectionId,
                agentId = session.agentId,
            )
            val catalogSession = session.toCatalog()
            val sessions = current.sessions
                .filterNot { existing -> existing.sessionId == catalogSession.sessionId } +
                catalogSession
            byKey[key] = current.copy(
                sessions = sortSessions(sessions),
                loading = false,
                error = null,
            )
            publishLocked()
        }
    }

    fun updateInfo(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        patch: AcpSessionInfoPatch,
    ) {
        synchronized(lock) {
            val key = Key(connectionId, agentId)
            val current = byKey[key] ?: return
            val updated = current.sessions.map { session ->
                if (session.sessionId != sessionId) {
                    session
                } else {
                    session.copy(
                        title = if (patch.titleChanged) patch.title.orEmpty() else session.title,
                        updatedAt = patch.updatedAt ?: session.updatedAt,
                    )
                }
            }
            byKey[key] = current.copy(sessions = sortSessions(updated))
            publishLocked()
        }
    }

    fun remove(connectionId: String, agentId: AgentId, sessionId: String) {
        synchronized(lock) {
            val key = Key(connectionId, agentId)
            val current = byKey[key] ?: return
            byKey[key] = current.copy(
                sessions = current.sessions.filterNot { session -> session.sessionId == sessionId },
            )
            publishLocked()
        }
    }

    fun removeAgent(connectionId: String, agentId: AgentId) {
        synchronized(lock) {
            byKey.remove(Key(connectionId, agentId))
            publishLocked()
        }
    }

    fun removeConnection(connectionId: String) {
        synchronized(lock) {
            val removed = byKey.keys.filter { key -> key.connectionId == connectionId }
            removed.forEach(byKey::remove)
            if (removed.isNotEmpty()) {
                publishLocked()
            }
        }
    }

    private fun publishLocked() {
        _snapshots.value = byKey.values.sortedWith(
            compareBy<AgentSessionSnapshot> { snapshot -> snapshot.connectionId }
                .thenBy { snapshot -> snapshot.agentId },
        )
    }
}

private fun AcpSessionInfo.toCatalog(): CatalogSession = CatalogSession(
    agentId = agentId,
    sessionId = sessionId,
    cwd = cwd,
    title = title.orEmpty(),
    updatedAt = updatedAt.orEmpty(),
    additionalDirectories = additionalDirectories,
)

private fun sortSessions(sessions: List<CatalogSession>): List<CatalogSession> =
    sessions.sortedWith(
        compareByDescending<CatalogSession> { session ->
            session.updatedAt.takeIf { it.isNotBlank() }
        }
            .thenBy { session -> session.agentId }
            .thenBy { session -> session.sessionId },
    )
