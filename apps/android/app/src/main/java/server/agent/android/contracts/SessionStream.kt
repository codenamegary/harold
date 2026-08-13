package server.agent.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
sealed interface SessionStreamClientMessage {
    @Serializable
    @SerialName("subscribe")
    data class Subscribe(
        val agentId: AgentId,
        val sessionId: String,
    ) : SessionStreamClientMessage

    @Serializable
    @SerialName("switch")
    data class Switch(
        val agentId: AgentId,
        val sessionId: String,
    ) : SessionStreamClientMessage

    @Serializable
    @SerialName("prompt")
    data class Prompt(
        val agentId: AgentId,
        val sessionId: String,
        val text: String,
    ) : SessionStreamClientMessage

    @Serializable
    @SerialName("cancel")
    data class Cancel(
        val agentId: AgentId,
        val sessionId: String,
    ) : SessionStreamClientMessage

    @Serializable
    @SerialName("permission_reply")
    data class PermissionReply(
        val requestId: String,
        val optionId: String,
    ) : SessionStreamClientMessage

    @Serializable
    @SerialName("extension_reply")
    data class ExtensionReply(
        val requestId: String,
        val result: JsonElement,
    ) : SessionStreamClientMessage
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
}

fun catalogSessionKey(agentId: AgentId, sessionId: String): String = "$agentId:$sessionId"
