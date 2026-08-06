package server.agent.android.contracts

import kotlinx.serialization.Serializable

@Serializable
data class PermissionRequestedPayload(
    val requestId: String,
    val turnId: String,
    val toolCallId: String,
    val toolName: String,
    val options: List<PermissionOption>,
)

@Serializable
data class PermissionResolvedPayload(
    val requestId: String,
    val turnId: String,
    val toolCallId: String,
    val optionId: String,
    val outcome: String,
)
