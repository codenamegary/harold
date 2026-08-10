package server.agent.android.contracts

import kotlinx.serialization.Serializable

typealias AgentId = String

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
)

@Serializable
data class AgentSettingsCollection(
    val items: List<AgentSettings>,
)
