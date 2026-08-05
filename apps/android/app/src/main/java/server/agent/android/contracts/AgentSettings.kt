package server.agent.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class AgentId {
    @SerialName("cursor")
    Cursor,

    @SerialName("claude")
    Claude,
}

@Serializable
data class AgentSettings(
    val id: AgentId,
    val displayName: String,
    val available: Boolean,
    val enabled: Boolean,
    val path: String?,
)

@Serializable
data class AgentSettingsCollection(
    val items: List<AgentSettings>,
)
