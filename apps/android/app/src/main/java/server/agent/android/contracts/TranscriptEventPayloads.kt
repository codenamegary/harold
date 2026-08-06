package server.agent.android.contracts

import kotlinx.serialization.Serializable

@Serializable
data class TurnStartedPayload(
    val turnId: String,
    val text: String,
)

@Serializable
data class TurnCompletedPayload(
    val turnId: String,
    val sessionId: String,
)

@Serializable
data class TurnFailedPayload(
    val turnId: String,
    val sessionId: String,
    val failureCode: FailureCode,
)

@Serializable
data class TurnCancelledPayload(
    val turnId: String,
    val sessionId: String,
)

@Serializable
data class SessionStatePayload(
    val sessionId: String,
    val state: SessionState,
)

@Serializable
data class ThoughtDeltaPayload(
    val turnId: String,
    val text: String,
)

@Serializable
data class OutputDeltaPayload(
    val turnId: String,
    val text: String,
)

@Serializable
data class OutputCompletePayload(
    val turnId: String,
    val text: String,
)

@Serializable
data class ToolStartedPayload(
    val turnId: String,
    val toolCallId: String,
    val toolName: String,
    val toolKind: ToolKind,
)

@Serializable
data class ToolCompletedPayload(
    val turnId: String,
    val toolCallId: String,
    val toolName: String,
    val toolKind: ToolKind,
    val status: ToolCallStatus,
)
