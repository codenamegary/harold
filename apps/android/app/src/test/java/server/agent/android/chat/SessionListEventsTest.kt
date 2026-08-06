package server.agent.android.chat

import org.junit.Assert.assertEquals
import org.junit.Test
import server.agent.android.contracts.EventEnvelope
import server.agent.android.contracts.EventType
import server.agent.android.contracts.AgentId
import server.agent.android.contracts.SessionState
import server.agent.android.contracts.SessionStatePayload
import kotlinx.serialization.json.JsonObject
import server.agent.android.contracts.AgentServerJson

class SessionListEventsTest {
    @Test
    fun updatesSessionStateInList() {
        val sessions = listOf(
            sessionRow("sess_01", SessionState.Running),
            sessionRow("sess_02", SessionState.Idle),
        )

        val updated = applySessionListStateEvents(
            sessions = sessions,
            events = listOf(
                sessionStateEvent("sess_01", SessionState.Stopping),
            ),
        )

        assertEquals(SessionState.Stopping, updated.first { it.id == "sess_01" }.state)
        assertEquals(SessionState.Idle, updated.first { it.id == "sess_02" }.state)
    }

    @Test
    fun removesArchivedSessionsFromList() {
        val sessions = listOf(
            sessionRow("sess_01", SessionState.Idle),
            sessionRow("sess_02", SessionState.Running),
        )

        val updated = applySessionListStateEvents(
            sessions = sessions,
            events = listOf(
                sessionStateEvent("sess_02", SessionState.Archived),
            ),
        )

        assertEquals(1, updated.size)
        assertEquals("sess_01", updated.single().id)
    }

    private fun sessionRow(id: String, state: SessionState): SessionRow =
        SessionRow(
            id = id,
            name = "Session $id",
            workspaceId = "ws_01",
            workspaceLabel = "agent-server",
            agentId = AgentId.Cursor,
            agentLabel = "Cursor",
            state = state,
        )

    private fun sessionStateEvent(sessionId: String, state: SessionState): EventEnvelope {
        val payload = AgentServerJson.encodeToJsonElement(
            SessionStatePayload.serializer(),
            SessionStatePayload(sessionId = sessionId, state = state),
        ) as JsonObject

        return EventEnvelope(
            type = EventType.SessionState,
            cursor = "1",
            occurredAt = "2026-08-06T00:00:00.000Z",
            sessionId = sessionId,
            payload = payload,
        )
    }
}
