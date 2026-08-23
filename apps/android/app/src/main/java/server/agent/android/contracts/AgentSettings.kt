package server.agent.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

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
data class AgentCapabilityAgentInfo(
    val name: String,
    val version: String,
    val title: String? = null,
)

@Serializable
data class AgentCapabilityInventoryEntry(
    val path: String,
    val advertised: Boolean,
    val value: JsonElement? = null,
    val known: Boolean,
    val requiredBy: List<String> = emptyList(),
)

@Serializable
data class AgentCapabilityInventory(
    val agentInfo: AgentCapabilityAgentInfo?,
    val entries: List<AgentCapabilityInventoryEntry> = emptyList(),
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
    val capabilities: AgentCapabilityInventory? = null,
    val authSummary: AgentAuthSummary = AgentAuthSummary(
        status = AgentAuthStatus.Unknown,
        error = null,
        activeSessionId = null,
        canLogout = false,
    ),
)

@Serializable
data class AgentSettingsCollection(
    val items: List<AgentSettings>,
)
