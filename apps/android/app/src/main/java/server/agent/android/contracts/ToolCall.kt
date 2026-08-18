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
