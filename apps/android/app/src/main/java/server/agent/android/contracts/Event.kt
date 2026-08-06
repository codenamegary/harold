package server.agent.android.contracts

import kotlinx.serialization.KSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonObject

@Serializable
enum class EventType {
    @SerialName("server.status")
    ServerStatus,

    @SerialName("workspace.changed")
    WorkspaceChanged,

    @SerialName("session.created")
    SessionCreated,

    @SerialName("session.state")
    SessionState,

    @SerialName("session.output.delta")
    SessionOutputDelta,

    @SerialName("session.output.complete")
    SessionOutputComplete,

    @SerialName("session.thought.delta")
    SessionThoughtDelta,

    @SerialName("session.tool.started")
    SessionToolStarted,

    @SerialName("session.tool.completed")
    SessionToolCompleted,

    @SerialName("session.permission.requested")
    SessionPermissionRequested,

    @SerialName("session.permission.resolved")
    SessionPermissionResolved,

    @SerialName("turn.started")
    TurnStarted,

    @SerialName("turn.completed")
    TurnCompleted,

    @SerialName("turn.failed")
    TurnFailed,

    @SerialName("turn.cancelled")
    TurnCancelled,

    @SerialName("device.paired")
    DevicePaired,

    @SerialName("device.connected")
    DeviceConnected,

    @SerialName("device.disconnected")
    DeviceDisconnected,

    @SerialName("device.revoked")
    DeviceRevoked,
}

/**
 * The scope shared by every event. `payload` stays raw until a story needs a
 * projection of it.
 */
@Serializable
data class EventEnvelope(
    val type: EventType,
    val cursor: String,
    val occurredAt: String,
    val workspaceId: String? = null,
    val sessionId: String? = null,
    val payload: JsonObject,
)

typealias EventFrame = List<EventEnvelope>

val EventFrameSerializer: KSerializer<EventFrame> = ListSerializer(EventEnvelope.serializer())
