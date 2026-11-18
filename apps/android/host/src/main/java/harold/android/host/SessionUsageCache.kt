package harold.android.host

import harold.android.contracts.SessionUsage

/** Where the next incremental scan of one agent should start. */
internal data class UsageAgentCursor(
    val newestRunId: String?,
    val newestRunOffset: Long?,
    val fullyScanned: Boolean,
)

/**
 * Process-wide usage cache. Nothing is persisted. A full scan replaces one
 * agent's slice. An incremental scan merges newer records and advances the
 * cursor, so old runs are not read again until the app restarts.
 */
internal class SessionUsageCache {
    private data class Key(val connectionId: String, val agentId: String)

    private data class AgentEntry(
        val sessions: MutableMap<String, SessionUsage> = linkedMapOf(),
        var newestRunId: String? = null,
        var newestRunOffset: Long? = null,
        var fullyScanned: Boolean = false,
    )

    private val lock = Any()
    private val agents = mutableMapOf<Key, AgentEntry>()

    fun cachedSessionUsage(
        connectionId: String,
        agentId: String,
        sessionId: String,
    ): SessionUsage? = synchronized(lock) {
        agents[Key(connectionId, agentId)]?.sessions?.get(sessionId)
    }

    fun cursor(connectionId: String, agentId: String): UsageAgentCursor? = synchronized(lock) {
        agents[Key(connectionId, agentId)]?.let { entry ->
            UsageAgentCursor(
                newestRunId = entry.newestRunId,
                newestRunOffset = entry.newestRunOffset,
                fullyScanned = entry.fullyScanned,
            )
        }
    }

    /** Replaces one agent's slice after a complete full scan. */
    fun replaceAgent(
        connectionId: String,
        agentId: String,
        sessions: List<SessionUsage>,
        newestRunId: String?,
        newestRunOffset: Long?,
    ) {
        synchronized(lock) {
            agents[Key(connectionId, agentId)] = AgentEntry(
                sessions = sessions.associateByTo(linkedMapOf()) { session -> session.sessionId },
                newestRunId = newestRunId,
                newestRunOffset = newestRunOffset,
                fullyScanned = true,
            )
        }
    }

    /** Merges one newest-run scan without dropping sessions from older runs. */
    fun mergeAgent(
        connectionId: String,
        agentId: String,
        sessions: List<SessionUsage>,
        newestRunId: String?,
        newestRunOffset: Long?,
    ) {
        synchronized(lock) {
            val entry = agents.getOrPut(Key(connectionId, agentId)) { AgentEntry() }
            for (session in sessions) {
                val previous = entry.sessions[session.sessionId]
                if (isNewer(session, previous)) {
                    entry.sessions[session.sessionId] = session.copy(
                        cost = session.cost ?: previous?.cost,
                    )
                }
            }
            if (newestRunId != null && newestRunOffset != null) {
                val currentRun = entry.newestRunId
                if (currentRun == null || newestRunId > currentRun) {
                    entry.newestRunId = newestRunId
                    entry.newestRunOffset = newestRunOffset
                } else if (newestRunId == currentRun) {
                    entry.newestRunOffset = maxOf(entry.newestRunOffset ?: 0, newestRunOffset)
                }
            }
        }
    }

    fun forgetSession(connectionId: String, agentId: String, sessionId: String) {
        synchronized(lock) {
            agents[Key(connectionId, agentId)]?.sessions?.remove(sessionId)
        }
    }

    fun forgetConnection(connectionId: String) {
        synchronized(lock) {
            agents.keys.removeAll { key -> key.connectionId == connectionId }
        }
    }

    private fun isNewer(candidate: SessionUsage, existing: SessionUsage?): Boolean {
        if (existing == null) {
            return true
        }
        val candidateRun = candidate.lastRunId ?: return false
        val existingRun = existing.lastRunId ?: return true
        if (candidateRun != existingRun) {
            return candidateRun > existingRun
        }
        return (candidate.lastOffset ?: 0) > (existing.lastOffset ?: 0)
    }
}
