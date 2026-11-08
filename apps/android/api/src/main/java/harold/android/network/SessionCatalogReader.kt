package harold.android.network

import harold.android.contracts.AgentId
import kotlinx.coroutines.flow.Flow

/**
 * One session the live ACP processes reported. Session history belongs to the
 * agent, so this is a memory-only snapshot with no Room backing.
 */
data class CatalogSession(
    val agentId: AgentId,
    val sessionId: String,
    val cwd: String,
    val title: String = "",
    val updatedAt: String = "",
    val additionalDirectories: List<String> = emptyList(),
)

/**
 * The live session list of one agent on one saved connection. [loading] and
 * [error] let the UI show each agent's refresh progress independently.
 */
data class AgentSessionSnapshot(
    val connectionId: String,
    val agentId: AgentId,
    val sessions: List<CatalogSession> = emptyList(),
    val loading: Boolean = false,
    val error: String? = null,
)

/** Read-only view of the sessions the live ACP runtime currently knows. */
interface SessionCatalogReader : SessionDirectoryProvider {
    /** Every agent snapshot, ordered by connection and agent id. */
    fun observeSnapshots(): Flow<List<AgentSessionSnapshot>>

    fun observeSnapshots(connectionId: String): Flow<List<AgentSessionSnapshot>>

    fun snapshots(): List<AgentSessionSnapshot>

    fun sessions(connectionId: String): List<CatalogSession>

    fun find(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): CatalogSession?
}
