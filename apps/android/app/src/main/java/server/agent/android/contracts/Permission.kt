package server.agent.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class PermissionOptionKind {
    @SerialName("allow")
    Allow,

    @SerialName("deny")
    Deny,

    @SerialName("other")
    Other,
}

@Serializable
data class PermissionOption(
    val optionId: String,
    val name: String,
    val kind: PermissionOptionKind? = null,
)

@Serializable
enum class PermissionStatus {
    @SerialName("pending")
    Pending,

    @SerialName("resolved")
    Resolved,
}

@Serializable
data class PermissionRequest(
    val id: String,
    val sessionId: String,
    val turnId: String,
    val toolCallId: String,
    val toolName: String,
    val status: PermissionStatus,
    val options: List<PermissionOption>,
    val createdAt: String,
)

typealias PermissionRequestCollection = ItemCollection<PermissionRequest>

@Serializable
data class ResolvePermissionRequestBody(
    val status: String = "resolved",
    val optionId: String,
)
