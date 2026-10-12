package harold.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class SessionState {
    @SerialName("starting")
    Starting,

    @SerialName("idle")
    Idle,

    @SerialName("running")
    Running,

    @SerialName("awaiting-permission")
    AwaitingPermission,

    @SerialName("stopping")
    Stopping,

    @SerialName("offline")
    Offline,

    @SerialName("error")
    Error,
}

@Serializable
data class Session(
    val agentId: AgentId,
    val sessionId: String,
    val cwd: String,
    val title: String,
    val updatedAt: String,
)

@Serializable
data class SessionCollection(
    val items: List<Session>,
)
