package harold.android.acp

import harold.android.contracts.AgentId
import harold.android.network.SessionDirectoryProvider
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The session lists Harold has seen from ACP. This is a memory-only view:
 * agents own session history, the app just compiles their `session/list`
 * answers here so lookups (workspace hints, opening a session's working
 * directory) do not need per-session files on the host.
 */
@Singleton
class AcpSessionCatalog @Inject constructor() : SessionDirectoryProvider {
    private val lock = Any()
    private val byConnection = mutableMapOf<String, List<AcpSessionInfo>>()

    override fun sessionDirectories(connectionId: String): List<String> =
        sessions(connectionId).orEmpty().map { session -> session.cwd }

    /** Every session currently known for a connection, newest first. */
    fun sessions(connectionId: String): List<AcpSessionInfo>? = synchronized(lock) {
        byConnection[connectionId]?.toList()
    }

    fun find(connectionId: String, agentId: AgentId, sessionId: String): AcpSessionInfo? =
        synchronized(lock) {
            byConnection[connectionId]?.firstOrNull { session ->
                session.agentId == agentId && session.sessionId == sessionId
            }
        }

    /**
     * Replaces the rows for the agents that answered this refresh, keeps the
     * previous rows for agents that were tried but failed, and drops rows for
     * agents that are no longer part of the enabled set. A failed agent
     * should not make its sessions vanish from the app.
     *
     * When [cwd] is set the refresh only covered that folder, so rows for
     * the same agent in other folders are kept.
     */
    fun merge(
        connectionId: String,
        sessions: List<AcpSessionInfo>,
        refreshedAgentIds: Set<AgentId>,
        attemptedAgentIds: Set<AgentId> = refreshedAgentIds,
        cwd: String? = null,
    ): List<AcpSessionInfo> = synchronized(lock) {
        val previous = byConnection[connectionId]
            .orEmpty()
            .filter { session ->
                if (session.agentId !in attemptedAgentIds) {
                    return@filter false
                }
                if (session.agentId !in refreshedAgentIds) {
                    return@filter true
                }
                cwd != null && session.cwd != cwd
            }
        val merged = mergeSessionLists(listOf(sessions, previous))
        byConnection[connectionId] = merged
        merged
    }

    fun upsert(connectionId: String, session: AcpSessionInfo): List<AcpSessionInfo> =
        synchronized(lock) {
            val merged = mergeSessionLists(
                listOf(byConnection[connectionId].orEmpty(), listOf(session)),
            )
            byConnection[connectionId] = merged
            merged
        }

    fun updateInfo(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        patch: AcpSessionInfoPatch,
    ) {
        synchronized(lock) {
            val current = byConnection[connectionId] ?: return
            val updated = current.map { session ->
                if (session.agentId != agentId || session.sessionId != sessionId) {
                    session
                } else {
                    session.copy(
                        title = if (patch.titleChanged) patch.title else session.title,
                        updatedAt = patch.updatedAt ?: session.updatedAt,
                    )
                }
            }
            byConnection[connectionId] = mergeSessionLists(listOf(updated))
        }
    }

    fun remove(connectionId: String, agentId: AgentId, sessionId: String) {
        synchronized(lock) {
            val current = byConnection[connectionId] ?: return
            byConnection[connectionId] = current.filterNot { session ->
                session.agentId == agentId && session.sessionId == sessionId
            }
        }
    }

    fun replaceAll(connectionId: String, sessions: List<AcpSessionInfo>) {
        synchronized(lock) {
            byConnection[connectionId] = mergeSessionLists(listOf(sessions))
        }
    }
}
