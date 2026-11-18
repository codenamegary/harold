package harold.android.contracts

import java.time.Instant

/** Cumulative session cost carried by an ACP `usage_update`. */
data class UsageCost(
    val amount: Double,
    val currency: String,
)

/**
 * The latest usage the host logs carry for one session. Agents may not replay
 * `usage_update` on `session/load`, so this survives process and app restarts
 * until the log run is cleaned up.
 */
data class SessionUsage(
    val agentId: AgentId,
    val sessionId: String,
    val used: Long,
    val size: Long,
    val cost: UsageCost? = null,
    val lastRunId: String? = null,
    /** Byte offset of the log line inside [lastRunId], used to order refreshes. */
    val lastOffset: Long? = null,
    val updatedAt: Instant? = null,
)
