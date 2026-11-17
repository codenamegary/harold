package harold.android.process

/** The agent process could not be launched or exited before the ACP handshake. */
class AgentLaunchException(message: String, cause: Throwable? = null) : Exception(message, cause)

/** The agent answered `session/new` with an auth requirement. */
class AgentAuthRequiredException(val agentId: String, detail: String?) :
    Exception(detail ?: "This agent needs you to sign in on the host.")

/** The agent definitively no longer has this session. Retrying cannot recover it. */
class AgentSessionGoneException(
    val agentId: String,
    val sessionId: String,
    detail: String?,
) : Exception(detail ?: "The agent no longer has this session.")

/** Launches ACP agent processes and ACP terminal commands on a saved host. */
interface AgentProcessLauncher {
    /** Enabled, present agents for a connection, using the same agents.json scan rules as today. */
    suspend fun launchableAgents(connectionId: String): Result<List<LaunchableAgent>>

    /**
     * Stable key for the host identity behind a saved connection: endpoint,
     * credentials, and pinned host key. Two saved rows that point at the same
     * host share one key.
     */
    suspend fun keyFor(connectionId: String): String

    suspend fun launchAgent(connectionId: String, agentId: String): Result<AgentProcessChannel>

    /**
     * Stops the persistent host for this agent. Launchers that own the process
     * directly can leave this as a no-op: closing the channel already ends it.
     */
    suspend fun stopAgent(connectionId: String, agentId: String): Result<Unit> =
        Result.success(Unit)

    suspend fun launchTerminal(
        connectionId: String,
        spec: TerminalLaunchSpec,
    ): Result<AgentProcessChannel>
}
