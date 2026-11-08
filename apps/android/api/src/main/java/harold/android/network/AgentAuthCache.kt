package harold.android.network

import harold.android.contracts.AgentAuthSummary
import harold.android.contracts.AgentId
import java.time.Duration
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** In-memory TTL cache for auth probes, keyed by connection and agent. */
@Singleton
class AgentAuthCache @Inject constructor() {
    private data class Entry(val summary: AgentAuthSummary, val at: Instant)

    private val ttl: Duration = DEFAULT_TTL
    private val entries = HashMap<String, Entry>()

    @Synchronized
    fun get(
        connectionId: String,
        agentId: AgentId,
        now: Instant = Instant.now(),
    ): AgentAuthSummary? {
        val entry = entries[key(connectionId, agentId)] ?: return null
        if (Duration.between(entry.at, now) > ttl) {
            entries.remove(key(connectionId, agentId))
            return null
        }
        return entry.summary
    }

    @Synchronized
    fun put(connectionId: String, agentId: AgentId, summary: AgentAuthSummary) {
        entries[key(connectionId, agentId)] = Entry(summary, Instant.now())
    }

    @Synchronized
    fun invalidate(connectionId: String, agentId: AgentId) {
        entries.remove(key(connectionId, agentId))
    }

    @Synchronized
    fun clear() {
        entries.clear()
    }

    private fun key(connectionId: String, agentId: AgentId): String = "$connectionId|$agentId"

    companion object {
        val DEFAULT_TTL: Duration = Duration.ofSeconds(30)
    }
}
