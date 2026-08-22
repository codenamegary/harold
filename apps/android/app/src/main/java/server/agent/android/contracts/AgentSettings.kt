package server.agent.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

typealias AgentId = String

@Serializable
enum class AgentRuntimeStatus {
    @SerialName("stopped")
    Stopped,

    @SerialName("starting")
    Starting,

    @SerialName("ready")
    Ready,

    @SerialName("error")
    Error,
}

@Serializable
data class AgentRuntimeState(
    val status: AgentRuntimeStatus,
    val error: String? = null,
)

@Serializable
data class AgentSettings(
    val id: AgentId,
    val displayName: String,
    val available: Boolean,
    val enabled: Boolean,
    val path: String?,
    val args: List<String> = emptyList(),
    val present: Boolean = false,
    val popular: Boolean = false,
    val deletable: Boolean = false,
    val state: AgentRuntimeState = AgentRuntimeState(AgentRuntimeStatus.Stopped),
)

@Serializable
data class AgentSettingsCollection(
    val items: List<AgentSettings>,
)
