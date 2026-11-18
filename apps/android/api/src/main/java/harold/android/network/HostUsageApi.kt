package harold.android.network

import harold.android.contracts.AgentId
import harold.android.contracts.SessionUsage

/**
 * Latest usage found in one agent's host logs. The cache is memory only, so a
 * process restart causes one full scan and later refreshes read only the new
 * bytes of the newest run.
 */
interface HostUsageApi {
    /** Reads the memory cache without touching the host. */
    fun cachedSessionUsage(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): SessionUsage?

    /**
     * Refreshes one session's usage. The first refresh for an agent scans every
     * run. Later refreshes read only the newest run, starting at the last safe
     * byte offset.
     */
    suspend fun refreshSessionUsage(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<SessionUsage?>

    /** Drops cached usage after a session is deleted. */
    fun forgetSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ) = Unit

    /** Drops every cached row for a forgotten connection. */
    fun forgetConnection(connectionId: String) = Unit
}
