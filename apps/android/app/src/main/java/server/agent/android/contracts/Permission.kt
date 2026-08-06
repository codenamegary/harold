package server.agent.android.contracts

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
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

@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class ResolvePermissionRequestBody(
    /**
     * Must be encoded even though it has a default. kotlinx.serialization omits
     * defaults unless marked, and the server requires `status: "resolved"`.
     */
    @EncodeDefault
    val status: String = "resolved",
    val optionId: String,
)
