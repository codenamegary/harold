package server.agent.android.contracts

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

    @SerialName("archived")
    Archived,
}

@Serializable
data class Session(
    val id: String,
    val workspaceId: String,
    val agentId: AgentId,
    val name: String,
    val state: SessionState,
    val createdAt: String,
    val lastUsedAt: String,
    val archivedAt: String?,
)

typealias SessionCollection = ItemCollection<Session>
