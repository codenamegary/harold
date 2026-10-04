package harold.android.contracts

import kotlinx.serialization.Serializable

@Serializable
data class CreateSessionBody(
    val agentId: AgentId,
    val cwd: String,
)

typealias CreateSessionResponse = Session
