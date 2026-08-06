package server.agent.android.chat

import kotlinx.serialization.json.decodeFromJsonElement
import server.agent.android.contracts.AgentServerJson
import server.agent.android.contracts.EventEnvelope
import server.agent.android.contracts.EventType
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.SessionStatePayload

fun applySessionListStateEvents(
    sessions: List<SessionRow>,
    events: List<EventEnvelope>,
): List<SessionRow> {
    var updated = sessions

    for (event in events) {
        if (event.type != EventType.SessionState) {
            continue
        }

        val payload = decodeSessionStatePayload(event) ?: continue
        val sessionId = payload.sessionId
        val nextState = payload.state

        updated = if (nextState == SessionState.Archived) {
            updated.filterNot { row -> row.id == sessionId }
        } else {
            updated.map { row ->
                if (row.id == sessionId) {
                    row.copy(state = nextState)
                } else {
                    row
                }
            }
        }
    }

    return updated
}

private fun decodeSessionStatePayload(event: EventEnvelope): SessionStatePayload? =
    runCatching {
        AgentServerJson.decodeFromJsonElement(SessionStatePayload.serializer(), event.payload)
    }.getOrNull()
