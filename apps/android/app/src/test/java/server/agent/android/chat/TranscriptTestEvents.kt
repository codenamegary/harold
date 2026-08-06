package server.agent.android.chat

import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import server.agent.android.contracts.EventEnvelope
import server.agent.android.contracts.EventType
import server.agent.android.contracts.SessionState

internal fun turnStarted(
    cursor: String,
    text: String = "Explain auth",
    turnId: String = "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
    sessionId: String = "sess_01",
): EventEnvelope = EventEnvelope(
    type = EventType.TurnStarted,
    cursor = cursor,
    occurredAt = "2026-08-05T00:00:00.000Z",
    sessionId = sessionId,
    payload = buildJsonObject {
        put("turnId", JsonPrimitive(turnId))
        put("text", JsonPrimitive(text))
    },
)

internal fun thoughtDelta(
    cursor: String,
    text: String,
    turnId: String = "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
    sessionId: String = "sess_01",
): EventEnvelope = EventEnvelope(
    type = EventType.SessionThoughtDelta,
    cursor = cursor,
    occurredAt = "2026-08-05T00:00:00.000Z",
    sessionId = sessionId,
    payload = buildJsonObject {
        put("turnId", JsonPrimitive(turnId))
        put("text", JsonPrimitive(text))
    },
)

internal fun outputDelta(
    cursor: String,
    text: String,
    turnId: String = "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
    sessionId: String = "sess_01",
): EventEnvelope = EventEnvelope(
    type = EventType.SessionOutputDelta,
    cursor = cursor,
    occurredAt = "2026-08-05T00:00:00.000Z",
    sessionId = sessionId,
    payload = buildJsonObject {
        put("turnId", JsonPrimitive(turnId))
        put("text", JsonPrimitive(text))
    },
)

internal fun toolStarted(
    cursor: String,
    turnId: String = "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
    sessionId: String = "sess_01",
): EventEnvelope = EventEnvelope(
    type = EventType.SessionToolStarted,
    cursor = cursor,
    occurredAt = "2026-08-05T00:00:00.000Z",
    sessionId = sessionId,
    payload = buildJsonObject {
        put("turnId", JsonPrimitive(turnId))
        put("toolCallId", JsonPrimitive("tool_01"))
        put("toolName", JsonPrimitive("read"))
        put("toolKind", JsonPrimitive("read"))
    },
)

internal fun toolCompleted(
    cursor: String,
    turnId: String = "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
    sessionId: String = "sess_01",
): EventEnvelope = EventEnvelope(
    type = EventType.SessionToolCompleted,
    cursor = cursor,
    occurredAt = "2026-08-05T00:00:00.000Z",
    sessionId = sessionId,
    payload = buildJsonObject {
        put("turnId", JsonPrimitive(turnId))
        put("toolCallId", JsonPrimitive("tool_01"))
        put("toolName", JsonPrimitive("read"))
        put("toolKind", JsonPrimitive("read"))
        put("status", JsonPrimitive("completed"))
    },
)

internal fun sessionState(
    cursor: String,
    state: SessionState,
    sessionId: String = "sess_01",
): EventEnvelope = EventEnvelope(
    type = EventType.SessionState,
    cursor = cursor,
    occurredAt = "2026-08-05T00:00:00.000Z",
    sessionId = sessionId,
    payload = buildJsonObject {
        put("sessionId", JsonPrimitive(sessionId))
        put(
            "state",
            JsonPrimitive(
                when (state) {
                    SessionState.Starting -> "starting"
                    SessionState.Idle -> "idle"
                    SessionState.Running -> "running"
                    SessionState.AwaitingPermission -> "awaiting-permission"
                    SessionState.Stopping -> "stopping"
                    SessionState.Offline -> "offline"
                    SessionState.Error -> "error"
                    SessionState.Archived -> "archived"
                },
            ),
        )
    },
)

internal fun turnCompleted(
    cursor: String,
    turnId: String = "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
    sessionId: String = "sess_01",
): EventEnvelope = EventEnvelope(
    type = EventType.TurnCompleted,
    cursor = cursor,
    occurredAt = "2026-08-05T00:00:00.000Z",
    sessionId = sessionId,
    payload = buildJsonObject {
        put("turnId", JsonPrimitive(turnId))
        put("sessionId", JsonPrimitive(sessionId))
    },
)

internal fun turnFailed(
    cursor: String,
    turnId: String = "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
    sessionId: String = "sess_01",
): EventEnvelope = EventEnvelope(
    type = EventType.TurnFailed,
    cursor = cursor,
    occurredAt = "2026-08-05T00:00:00.000Z",
    sessionId = sessionId,
    payload = buildJsonObject {
        put("turnId", JsonPrimitive(turnId))
        put("sessionId", JsonPrimitive(sessionId))
        put("failureCode", JsonPrimitive("agent_error"))
    },
)

internal fun permissionRequested(
    cursor: String,
    sessionId: String = "sess_01",
    requestId: String = "perm_01",
): EventEnvelope = EventEnvelope(
    type = server.agent.android.contracts.EventType.SessionPermissionRequested,
    cursor = cursor,
    occurredAt = "2026-08-06T00:00:00.000Z",
    sessionId = sessionId,
    payload = buildJsonObject {
        put("requestId", JsonPrimitive(requestId))
        put("turnId", JsonPrimitive("turn_01"))
        put("toolCallId", JsonPrimitive("tool_01"))
        put("toolName", JsonPrimitive("fake-tool"))
        put(
            "options",
            buildJsonArray {
                addJsonObject {
                    put("optionId", JsonPrimitive("allow-once"))
                    put("name", JsonPrimitive("Allow once"))
                    put("kind", JsonPrimitive("allow"))
                }
                addJsonObject {
                    put("optionId", JsonPrimitive("reject-once"))
                    put("name", JsonPrimitive("Reject once"))
                    put("kind", JsonPrimitive("deny"))
                }
            },
        )
    },
)

internal fun turnCancelled(
    cursor: String,
    turnId: String = "turn_01JFC8C7E77NQCFH0RF9Z22JHH",
    sessionId: String = "sess_01",
): EventEnvelope = EventEnvelope(
    type = EventType.TurnCancelled,
    cursor = cursor,
    occurredAt = "2026-08-05T00:00:00.000Z",
    sessionId = sessionId,
    payload = buildJsonObject {
        put("turnId", JsonPrimitive(turnId))
        put("sessionId", JsonPrimitive(sessionId))
    },
)
