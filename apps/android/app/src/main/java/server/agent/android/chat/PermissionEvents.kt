package server.agent.android.chat

import kotlinx.serialization.json.decodeFromJsonElement
import server.agent.android.contracts.AgentServerJson
import server.agent.android.contracts.EventEnvelope
import server.agent.android.contracts.EventType
import server.agent.android.contracts.PermissionRequest
import server.agent.android.contracts.PermissionRequestedPayload
import server.agent.android.contracts.PermissionResolvedPayload
import server.agent.android.contracts.PermissionStatus

private fun toPendingRequest(event: EventEnvelope): PermissionRequest {
    val sessionId = event.sessionId
        ?: error("permission request event missing session id")
    val payload = AgentServerJson.decodeFromJsonElement(
        PermissionRequestedPayload.serializer(),
        event.payload,
    )

    return PermissionRequest(
        id = payload.requestId,
        sessionId = sessionId,
        turnId = payload.turnId,
        toolCallId = payload.toolCallId,
        toolName = payload.toolName,
        status = PermissionStatus.Pending,
        options = payload.options,
        createdAt = event.occurredAt,
    )
}

fun applyPermissionEvents(
    current: List<PermissionRequest>,
    events: List<EventEnvelope>,
): List<PermissionRequest> =
    events.fold(current) { pending, event ->
        when (event.type) {
            EventType.SessionPermissionRequested -> {
                val next = toPendingRequest(event)
                val withoutDuplicate = pending.filterNot { item -> item.id == next.id }
                (withoutDuplicate + next).sortedBy { item -> item.createdAt }
            }

            EventType.SessionPermissionResolved -> {
                val payload = AgentServerJson.decodeFromJsonElement(
                    PermissionResolvedPayload.serializer(),
                    event.payload,
                )
                pending.filterNot { item -> item.id == payload.requestId }
            }

            else -> pending
        }
    }

fun mergePendingRead(
    current: List<PermissionRequest>,
    fromRead: List<PermissionRequest>,
): List<PermissionRequest> {
    val byId = current.associateBy { item -> item.id }.toMutableMap()
    fromRead.forEach { item -> byId[item.id] = item }
    return byId.values
        .filter { item -> item.status == PermissionStatus.Pending }
        .sortedBy { item -> item.createdAt }
}

fun activePermissionRequest(
    pending: List<PermissionRequest>,
): PermissionRequest? =
    pending
        .filter { item -> item.status == PermissionStatus.Pending }
        .minByOrNull { item -> item.createdAt }
