package server.agent.android.contracts

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class ToolKind {
    @SerialName("read")
    Read,

    @SerialName("edit")
    Edit,

    @SerialName("execute")
    Execute,
}

@Serializable
enum class ToolCallStatus {
    @SerialName("pending")
    Pending,

    @SerialName("in_progress")
    InProgress,

    @SerialName("completed")
    Completed,

    @SerialName("failed")
    Failed,
}

@Serializable
enum class FailureCode {
    @SerialName("transport_connection_refused")
    TransportConnectionRefused,

    @SerialName("transport_connection_reset")
    TransportConnectionReset,

    @SerialName("transport_timeout")
    TransportTimeout,

    @SerialName("transport_pipe_closed")
    TransportPipeClosed,

    @SerialName("transport_invalid_json")
    TransportInvalidJson,

    @SerialName("transport_error")
    TransportError,

    @SerialName("prompt_failed")
    PromptFailed,

    @SerialName("agent_error")
    AgentError,

    @SerialName("protocol_error")
    ProtocolError,
}
