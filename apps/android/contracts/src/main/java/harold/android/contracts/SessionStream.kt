package harold.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * REST body for `POST /v1/sessions/:sessionId/prompts`. The watched session
 * travels in the path and the `agentId` query parameter, not the body.
 */
@Serializable
data class PromptRequestBody(
    val text: String,
    val attachments: List<AttachmentReference> = emptyList(),
)

/** REST body for `POST /v1/permissions/:requestId/replies`. */
@Serializable
data class PermissionReplyBody(
    val optionId: String,
)

/** REST body for `POST /v1/extensions/:requestId/replies`. */
@Serializable
data class ExtensionReplyBody(
    val result: JsonElement,
)

/**
 * REST body for `POST /v1/elicitations/:requestId/replies`. The result is the
 * raw ACP response: `{ action: "accept" | "decline" | "cancel", content? }`.
 */
@Serializable
data class ElicitationReplyBody(
    val result: JsonElement,
)

@Serializable
enum class ElicitationResolvedReason {
    @SerialName("replied")
    Replied,

    @SerialName("timed_out")
    TimedOut,

    @SerialName("session_cancelled")
    SessionCancelled,

    @SerialName("agent_exited")
    AgentExited,

    @SerialName("cancelled_by_agent")
    CancelledByAgent,
}

@Serializable
sealed interface SessionStreamServerMessage {
    @Serializable
    @SerialName("session_update")
    data class SessionUpdate(
        val agentId: AgentId,
        val sessionId: String,
        val update: JsonElement,
    ) : SessionStreamServerMessage

    /**
     * A full replay follows. The client was missing a resume cursor or sent a
     * stale one, so it must discard the cached transcript before folding the
     * replay events that arrive next.
     */
    @Serializable
    @SerialName("stream_reset")
    data class StreamReset(
        val agentId: AgentId,
        val sessionId: String,
    ) : SessionStreamServerMessage

    @Serializable
    @SerialName("session_config")
    data class SessionConfig(
        val agentId: AgentId,
        val sessionId: String,
        val configOptions: List<JsonElement>,
    ) : SessionStreamServerMessage

    @Serializable
    @SerialName("subscribed")
    data class Subscribed(
        val agentId: AgentId,
        val sessionId: String,
    ) : SessionStreamServerMessage

    @Serializable
    @SerialName("permission_request")
    data class PermissionRequest(
        val requestId: String,
        val agentId: AgentId,
        val sessionId: String,
        val params: JsonElement,
    ) : SessionStreamServerMessage

    @Serializable
    @SerialName("extension_request")
    data class ExtensionRequest(
        val requestId: String,
        val method: String,
        val agentId: AgentId,
        val sessionId: String,
        val params: JsonElement,
    ) : SessionStreamServerMessage

    @Serializable
    @SerialName("elicitation_request")
    data class ElicitationRequest(
        val requestId: String,
        val agentId: AgentId,
        val sessionId: String,
        val params: JsonElement,
        val expiresAt: String,
    ) : SessionStreamServerMessage

    @Serializable
    @SerialName("elicitation_resolved")
    data class ElicitationResolved(
        val requestId: String,
        val agentId: AgentId,
        val sessionId: String,
        val reason: ElicitationResolvedReason,
        val result: JsonElement? = null,
    ) : SessionStreamServerMessage

    @Serializable
    @SerialName("elicitation_completed")
    data class ElicitationCompleted(
        val elicitationId: String,
        val requestId: String,
        val agentId: AgentId,
        val sessionId: String,
    ) : SessionStreamServerMessage

    @Serializable
    @SerialName("error")
    data class Error(
        val message: String,
        val agentId: AgentId? = null,
        val sessionId: String? = null,
    ) : SessionStreamServerMessage

    @Serializable
    @SerialName("prompt_complete")
    data class PromptComplete(
        val agentId: AgentId,
        val sessionId: String,
    ) : SessionStreamServerMessage

    @Serializable
    @SerialName("cancelled")
    data class Cancelled(
        val agentId: AgentId,
        val sessionId: String,
    ) : SessionStreamServerMessage

    @Serializable
    @SerialName("auth_session_updated")
    data class AuthSessionUpdated(
        val agentId: AgentId,
        val auth: AgentAuth,
    ) : SessionStreamServerMessage

    @Serializable
    @SerialName("session_info")
    data class SessionInfo(
        val agentId: AgentId,
        val sessionId: String,
        val title: String?,
    ) : SessionStreamServerMessage
}

fun catalogSessionKey(agentId: AgentId, sessionId: String): String = "$agentId:$sessionId"
