package harold.android.network

import harold.android.contracts.AgentId
import harold.android.contracts.ConfigValue

/** Write surface for session config options. The session_config frame echoes the result. */
interface SessionConfigApi {
    suspend fun setConfigOption(
        connectionId: String,
        agentId: AgentId,
        sessionId: String,
        configId: String,
        value: ConfigValue,
    ): Result<Unit>
}
