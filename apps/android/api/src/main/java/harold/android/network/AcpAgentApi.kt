package harold.android.network

import harold.android.contracts.AgentCapabilityInventory
import harold.android.contracts.AgentId
import harold.android.contracts.CreateSessionBody
import harold.android.contracts.CreateSessionResponse
import harold.android.contracts.SessionCollection

/** ACP session surface for one saved connection. */
interface AcpAgentApi : SessionConfigApi, SessionCommandApi {
    suspend fun listSessions(
        connectionId: String,
        cwd: String? = null,
    ): Result<SessionCollection>

    suspend fun createSession(
        connectionId: String,
        body: CreateSessionBody,
    ): Result<CreateSessionResponse>

    suspend fun deleteSession(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<Unit>

    /** Closes the agent's live ACP processes; the next session spawns fresh. */
    suspend fun restartAgent(
        connectionId: String,
        agentId: AgentId,
    ): Result<Unit> = Result.failure(unsupported("agent restarts are not supported"))

    /** The live capability handshake of the session, or null before it completes. */
    suspend fun getAgentCapabilities(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
    ): Result<AgentCapabilityInventory?> = Result.failure(
        unsupported("capability lookups are not supported"),
    )
}

private fun unsupported(what: String): UnsupportedOperationException =
    UnsupportedOperationException(what)
